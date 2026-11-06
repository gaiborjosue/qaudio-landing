-- Distinguish sent media from unsent photos added to an existing chat.
alter table public.media_assets add column sent_at timestamptz;
update public.media_assets a set sent_at=a.created_at from public.media_upload_sessions s where a.session_id=s.id and s.started_at is not null;
create function private.attach_media_uploads(p_session uuid,p_paths text[])
returns void language plpgsql security definer set search_path = '' as $$
declare p text; a public.media_assets;
begin
  if not private.is_admin() or coalesce(array_length(p_paths,1),0)>100 then raise insufficient_privilege; end if;
  foreach p in array p_paths loop
    select * into a from public.media_assets where bucket_id='chat-uploads' and path=p for update;
    if a.path is null or a.owner_id<>auth.uid() or a.session_id<>p_session or a.state<>'ready' then raise insufficient_privilege; end if;
    update public.media_assets set sent_at=coalesce(sent_at,now()),expires_at=greatest(expires_at,now()+interval '7 days'),lease_until=greatest(lease_until,now()+interval '15 minutes') where bucket_id='chat-uploads' and path=p;
  end loop;
end $$;
create function public.attach_media_uploads(p_session uuid,p_paths text[])
returns void language sql security invoker set search_path = '' as $$ select private.attach_media_uploads(p_session,p_paths) $$;
revoke all on function private.attach_media_uploads(uuid,text[]),public.attach_media_uploads(uuid,text[]) from public,anon;
grant execute on function private.attach_media_uploads(uuid,text[]),public.attach_media_uploads(uuid,text[]) to authenticated;

create or replace function private.discard_media_upload(p_bucket text,p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.media_assets;
begin
  if not private.is_admin() or p_path not like 'uploads/%' then raise insufficient_privilege; end if;
  select * into a from public.media_assets where bucket_id=p_bucket and path=p_path for update;
  if a.path is null and p_bucket='media' then return; end if;
  if a.path is null or a.owner_id <> auth.uid() or a.state <> 'ready' or a.sent_at is not null or exists(select 1 from public.media_references where bucket_id=p_bucket and path=p_path) then raise insufficient_privilege; end if;
  update public.media_assets set session_id=null,expires_at=now(),lease_until=now() where bucket_id=p_bucket and path=p_path;
end $$;

create or replace function public.claim_media_cleanup(p_token text,p_dry_run boolean default true,p_limit integer default 100)
returns table(bucket_id text,path text) language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_media_cleanup_token(p_token);
  if not p_dry_run then
    update public.media_upload_sessions set ended_at=last_active_at+interval '30 days'
      where started_at is not null and ended_at is null and not active_turn and last_active_at<now()-interval '30 days';
  end if;
  return query with candidates as (
    select a.bucket_id,a.path from public.media_assets a left join public.media_upload_sessions s on s.id=a.session_id
    where a.managed and a.state <> 'deleted' and a.expires_at<=now() and a.lease_until<=now()
      and not exists(select 1 from public.media_references r where r.bucket_id=a.bucket_id and r.path=a.path)
      and (a.sent_at is null or s.id is null or (not s.active_turn and (
        (s.started_at is null and s.last_active_at<now()-interval '24 hours') or
        (s.ended_at is not null and s.ended_at<now()-interval '7 days') or
        (s.ended_at is null and s.started_at is not null and s.last_active_at<now()-interval '37 days')
      )))
    order by a.expires_at,a.bucket_id,a.path limit least(greatest(p_limit,1),1000) for update of a skip locked
  ), claimed as (
    update public.media_assets a set state='deleting',lease_until=now()+interval '15 minutes',attempts=attempts+1
      from candidates c where not p_dry_run and a.bucket_id=c.bucket_id and a.path=c.path returning a.bucket_id,a.path
  ) select c.bucket_id,c.path from candidates c where p_dry_run union all select c.bucket_id,c.path from claimed c;
end $$;
