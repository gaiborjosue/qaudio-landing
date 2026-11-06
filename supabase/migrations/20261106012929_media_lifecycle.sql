-- Application-owned lifecycle metadata. Never DELETE storage.objects in SQL.
create table public.media_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  eve_session_id text unique,
  started_at timestamptz,
  last_active_at timestamptz not null default now(),
  active_turn boolean not null default false,
  ended_at timestamptz
);
create table public.media_assets (
  bucket_id text not null check (bucket_id in ('media','chat-uploads')),
  path text not null check (length(path) <= 300 and path !~ '(^|/)\.\.(/|$)'),
  owner_id uuid references auth.users(id),
  session_id uuid references public.media_upload_sessions(id),
  managed boolean not null default true,
  state text not null default 'ready' check (state in ('ready','deleting','deleted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  lease_until timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  primary key(bucket_id,path)
);
create table public.media_references (
  source text not null,
  record_id text not null,
  bucket_id text not null,
  path text not null,
  primary key(source,record_id,bucket_id,path),
  foreign key(bucket_id,path) references public.media_assets(bucket_id,path)
);
create index media_assets_expiry on public.media_assets(expires_at) where managed and state <> 'deleted';
create index media_assets_session on public.media_assets(session_id);
create index media_references_asset on public.media_references(bucket_id,path);
create index media_sessions_owner on public.media_upload_sessions(owner_id);
alter table public.media_upload_sessions enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_references enable row level security;
revoke all on public.media_upload_sessions, public.media_assets, public.media_references from anon, authenticated;
grant select on public.media_upload_sessions, public.media_assets, public.media_references to authenticated;
grant all on public.media_upload_sessions, public.media_assets, public.media_references to service_role;
create policy "Admins read their upload sessions" on public.media_upload_sessions for select to authenticated
  using ((select private.is_admin()) and owner_id = (select auth.uid()));
create policy "Admins read public media and their private uploads" on public.media_assets for select to authenticated
  using ((select private.is_admin()) and (bucket_id = 'media' or owner_id = (select auth.uid())));
create policy "Admins read media references" on public.media_references for select to authenticated
  using ((select private.is_admin()) and exists (select 1 from public.media_assets a where a.bucket_id = media_references.bucket_id and a.path = media_references.path));

-- Existing files have no trustworthy session association: inventory only.
insert into public.media_assets(bucket_id,path,owner_id,managed,created_at)
select bucket_id,name,null,false,created_at from storage.objects where bucket_id = 'media';

create function public.media_session_event(p_id uuid, p_eve text default null, p_event text default 'draft')
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.media_upload_sessions; uid uuid := auth.uid();
begin
  if not private.is_admin() or uid is null then raise insufficient_privilege; end if;
  if p_event not in ('draft','active','settled','ended') or length(coalesce(p_eve,'')) > 200 then raise exception 'Invalid media session'; end if;
  if p_eve is not null then select * into s from public.media_upload_sessions where eve_session_id = p_eve for update; end if;
  if s.id is null and p_id is not null then select * into s from public.media_upload_sessions where id = p_id for update; end if;
  if s.id is null then
    insert into public.media_upload_sessions(id,owner_id,eve_session_id) values(coalesce(p_id,gen_random_uuid()),uid,p_eve) returning * into s;
  end if;
  if s.owner_id <> uid or (s.eve_session_id is not null and p_eve is not null and s.eve_session_id <> p_eve) then raise insufficient_privilege; end if;
  if s.ended_at is not null and p_event <> 'ended' then raise exception 'Media session ended'; end if;
  update public.media_upload_sessions set
    eve_session_id = coalesce(eve_session_id,p_eve), last_active_at = now(),
    started_at = case when p_event in ('active','settled') then coalesce(started_at,now()) else started_at end,
    active_turn = case when p_event = 'active' then true when p_event in ('settled','ended') then false else active_turn end,
    ended_at = case when p_event = 'ended' then coalesce(ended_at,now()) else ended_at end
    where id = s.id;
  return s.id;
end $$;

create function public.register_media_upload(p_bucket text, p_path text, p_session uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() or auth.uid() is null then raise insufficient_privilege; end if;
  if p_bucket <> 'chat-uploads' or p_session is null or
    p_path !~ ('^uploads/chat/' || p_session::text || '/[0-9a-f-]{36}\.(webp|jpg)$') or
    not exists(select 1 from public.media_upload_sessions where id = p_session and owner_id = auth.uid() and ended_at is null)
    then raise insufficient_privilege; end if;
  insert into public.media_assets(bucket_id,path,owner_id,session_id) values(p_bucket,p_path,auth.uid(),p_session);
end $$;

create function public.pin_media_asset(p_bucket text,p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.media_assets;
begin
  if not private.is_admin() then raise insufficient_privilege; end if;
  select * into a from public.media_assets where bucket_id=p_bucket and path=p_path for update;
  if a.path is null and p_bucket='media' then return; end if;
  if a.path is null or a.state <> 'ready' or (a.bucket_id='chat-uploads' and a.owner_id <> auth.uid()) then raise exception 'Photo unavailable'; end if;
  update public.media_assets set lease_until=greatest(lease_until,now()+interval '15 minutes') where bucket_id=p_bucket and path=p_path;
end $$;

create function public.prepare_media_copy(p_bucket text,p_path text,p_destination text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.pin_media_asset(p_bucket,p_path);
  if p_destination !~ '^(products|news|instagram|categories|brands|category-scenes)/[0-9a-zA-Z_.-]+$' then raise exception 'Invalid media destination'; end if;
  insert into public.media_assets(bucket_id,path,owner_id,expires_at,lease_until)
    values('media',p_destination,auth.uid(),now()+interval '7 days',now()+interval '15 minutes') on conflict do nothing;
  perform public.pin_media_asset('media',p_destination);
end $$;

create function public.discard_media_upload(p_bucket text,p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.media_assets;
begin
  if not private.is_admin() or p_path not like 'uploads/%' then raise insufficient_privilege; end if;
  select * into a from public.media_assets where bucket_id=p_bucket and path=p_path for update;
  if a.path is null and p_bucket='media' then return; end if;
  if a.path is null or a.owner_id <> auth.uid() or a.state <> 'ready' or exists(select 1 from public.media_references where bucket_id=p_bucket and path=p_path) then raise insufficient_privilege; end if;
  update public.media_assets set session_id=null,expires_at=now(),lease_until=now() where bucket_id=p_bucket and path=p_path;
end $$;

-- A transaction that saves a reference locks its asset before the collector
-- can claim it. A claimed/deleted asset cannot gain a new reference.
create function private.sync_media_references()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rid text; p text; a public.media_assets;
begin
  rid := case when tg_op='DELETE' then coalesce(to_jsonb(old)->>'id',to_jsonb(old)->>'slug') else coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'slug') end;
  update public.media_assets set expires_at=greatest(expires_at,now()+interval '7 days') where (bucket_id,path) in
    (select bucket_id,path from public.media_references where source=tg_table_name and record_id=rid);
  delete from public.media_references where source=tg_table_name and record_id=rid;
  if tg_op <> 'DELETE' then
    for p in select distinct v #>> '{}' from jsonb_path_query(to_jsonb(new),'$.** ? (@.type() == "string")') v loop
      select * into a from public.media_assets where bucket_id='media' and path=p for update;
      if a.path is null then continue; end if;
      if a.state <> 'ready' then raise exception 'Photo unavailable'; end if;
      insert into public.media_references(source,record_id,bucket_id,path) values(tg_table_name,rid,'media',p) on conflict do nothing;
    end loop;
    return new;
  end if;
  return old;
end $$;
do $$ declare t text; r record; p text; rid text;
begin
  foreach t in array array['news_posts','products','product_images','catalog_categories','catalog_brands','deals','deal_items'] loop
    execute format('create trigger media_references_sync after insert or update or delete on public.%I for each row execute function private.sync_media_references()',t);
    for r in execute format('select to_jsonb(t) as doc from public.%I t',t) loop
      rid := coalesce(r.doc->>'id',r.doc->>'slug');
      for p in select distinct v #>> '{}' from jsonb_path_query(r.doc,'$.** ? (@.type() == "string")') v loop
        insert into public.media_references(source,record_id,bucket_id,path)
          select t,rid,'media',p where exists(select 1 from public.media_assets where bucket_id='media' and path=p) on conflict do nothing;
      end loop;
    end loop;
  end loop;
end $$;

-- External Instagram records need explicit references; uncertain saves retain
-- their operation reference until reconciled, rather than risking deletion.
create function public.set_instagram_media(p_id text,p_paths text[])
returns void language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  if not private.is_admin() or length(p_id) not between 1 and 250 then raise insufficient_privilege; end if;
  foreach p in array p_paths loop perform public.pin_media_asset('media',p); end loop;
  update public.media_assets set expires_at=greatest(expires_at,now()+interval '7 days') where (bucket_id,path) in
    (select bucket_id,path from public.media_references where source='instagram' and record_id=p_id);
  delete from public.media_references where source='instagram' and record_id=p_id;
  foreach p in array p_paths loop
    insert into public.media_references(source,record_id,bucket_id,path)
      select 'instagram',p_id,'media',p where exists(select 1 from public.media_assets where bucket_id='media' and path=p) on conflict do nothing;
  end loop;
end $$;

-- Private uploads are accessible only to their signed-in admin owner.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-uploads','chat-uploads',false,30000000,array['image/webp','image/jpeg']) on conflict do nothing;
create policy "Owners read tracked chat images" on storage.objects for select to authenticated
using(bucket_id='chat-uploads' and (select private.is_admin()) and exists(select 1 from public.media_assets a where a.bucket_id='chat-uploads' and a.path=name and a.owner_id=(select auth.uid()) and a.state='ready'));
create policy "Owners upload registered chat images" on storage.objects for insert to authenticated
with check(bucket_id='chat-uploads' and (select private.is_admin()) and exists(select 1 from public.media_assets a where a.bucket_id='chat-uploads' and a.path=name and a.owner_id=(select auth.uid()) and a.state='ready'));
create policy "Owners remove discarded chat images" on storage.objects for delete to authenticated
using(bucket_id='chat-uploads' and (select private.is_admin()) and exists(select 1 from public.media_assets a where a.bucket_id='chat-uploads' and a.path=name and a.owner_id=(select auth.uid()) and a.session_id is null and a.expires_at<=now()) and not exists(select 1 from public.media_references r where r.bucket_id='chat-uploads' and r.path=name));

-- Only the cleanup worker uses a service role. Its separate, random Cron
-- credential stays in Vault and is never exposed through a client RPC.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'media_cleanup_token','Cron-to-media-cleanup authentication');
create function private.check_media_cleanup_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or not exists(select 1 from vault.decrypted_secrets where name='media_cleanup_token' and decrypted_secret=p_token) then raise insufficient_privilege; end if;
end $$;

create function public.claim_media_cleanup(p_token text,p_dry_run boolean default true,p_limit integer default 100)
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
      and (s.id is null or (not s.active_turn and (
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
create function public.complete_media_cleanup(p_token text,p_bucket text,p_path text,p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_media_cleanup_token(p_token);
  if p_success and exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_path) then raise exception 'Storage object still exists'; end if;
  update public.media_assets set state=case when p_success then 'deleted' else 'ready' end,
    lease_until=now()+interval '1 hour',last_error=case when p_success then null else 'Storage deletion failed' end
    where bucket_id=p_bucket and path=p_path and state='deleting';
end $$;
create function private.run_media_cleanup(p_dry_run boolean default false)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://kemumhpxapfadqsytudt.supabase.co/functions/v1/media-cleanup',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='media_cleanup_token')),
    body := jsonb_build_object('dryRun',p_dry_run), timeout_milliseconds := 60000
  );
$$;
-- Start disabled until the deployed worker passes a dry run.
select cron.schedule('media-cleanup-daily','17 7 * * *','select private.run_media_cleanup(false)');
select cron.alter_job((select jobid from cron.job where jobname='media-cleanup-daily'),active:=false);

revoke all on function public.media_session_event(uuid,text,text),public.register_media_upload(text,text,uuid),public.pin_media_asset(text,text),public.prepare_media_copy(text,text,text),public.discard_media_upload(text,text),public.set_instagram_media(text,text[]) from public,anon;
grant execute on function public.media_session_event(uuid,text,text),public.register_media_upload(text,text,uuid),public.pin_media_asset(text,text),public.prepare_media_copy(text,text,text),public.discard_media_upload(text,text),public.set_instagram_media(text,text[]) to authenticated;
revoke all on function public.claim_media_cleanup(text,boolean,integer),public.complete_media_cleanup(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_media_cleanup(text,boolean,integer),public.complete_media_cleanup(text,text,text,boolean) to service_role;
revoke all on function private.sync_media_references(),private.check_media_cleanup_token(text),private.run_media_cleanup(boolean) from public,anon,authenticated;
comment on table public.media_assets is 'Tracked uploads and promoted copies. Legacy inventory is unmanaged; only explicitly managed, expired, unreferenced assets are collected.';
