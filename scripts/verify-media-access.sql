-- Transactional role/lifecycle checks. No Storage API or real file deletions.
-- Run as the project database owner; every fixture is rolled back.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',(select user_id::text from private.admins limit 1),'role','authenticated')::text, true);
set local role authenticated;
do $$ declare s uuid; p text;
begin
  s := public.media_session_event('00000000-0000-4000-8000-000000000071','media-verification-active','active');
  if s <> public.media_session_event('00000000-0000-4000-8000-000000000072','media-verification-active','draft') then raise exception 'Session binding changed'; end if;
  p := 'uploads/chat/' || s::text || '/00000000-0000-4000-8000-000000000071.webp';
  perform public.register_media_upload('chat-uploads',p,s);
  perform public.attach_media_uploads(s,array[p]);
  perform public.register_media_upload('chat-uploads','uploads/chat/'||s::text||'/00000000-0000-4000-8000-000000000072.webp',s);
  if not exists(select 1 from public.media_assets where bucket_id='chat-uploads' and path=p) then raise exception 'Owner cannot read upload'; end if;
  begin
    perform public.register_media_upload('chat-uploads','uploads/chat/00000000-0000-4000-8000-000000000099/00000000-0000-4000-8000-000000000071.webp',s);
    raise exception 'Foreign path accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ declare uid uuid := auth.uid(); tok text; s uuid; paths text[]; n uuid;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name='media_cleanup_token';
  -- Old age alone never expires files in an active approval/turn.
  update public.media_assets set expires_at=now()-interval '40 days',lease_until=now()-interval '1 day' where session_id='00000000-0000-4000-8000-000000000071';
  insert into public.media_upload_sessions(id,owner_id,last_active_at,started_at,ended_at) values
    ('00000000-0000-4000-8000-000000000073',uid,now()-interval '2 days',null,null),
    ('00000000-0000-4000-8000-000000000074',uid,now(),now()-interval '2 days',now()),
    ('00000000-0000-4000-8000-000000000075',uid,now()-interval '9 days',now()-interval '10 days',now()-interval '8 days');
  insert into public.media_assets(bucket_id,path,owner_id,expires_at,session_id) values
    ('media','uploads/__lifecycle_expired.jpg',uid,now()-interval '2 days',null),
    ('media','uploads/__lifecycle_unsent.jpg',uid,now()-interval '2 days','00000000-0000-4000-8000-000000000073'),
    ('media','uploads/__lifecycle_recent_end.jpg',uid,now()-interval '2 days','00000000-0000-4000-8000-000000000074'),
    ('media','uploads/__lifecycle_old_end.jpg',uid,now()-interval '2 days','00000000-0000-4000-8000-000000000075'),
    ('media','news/__lifecycle_saved.jpg',uid,now()-interval '2 days',null),
    ('media','uploads/__lifecycle_leased.jpg',uid,now()-interval '2 days',null),
    ('media','uploads/__lifecycle_legacy.jpg',uid,now()-interval '2 days',null);
  update public.media_assets set lease_until=now()+interval '15 minutes' where path='uploads/__lifecycle_leased.jpg';
  update public.media_assets set managed=false where path='uploads/__lifecycle_legacy.jpg';
  update public.media_assets a set sent_at=a.created_at from public.media_upload_sessions s where a.session_id=s.id and s.started_at is not null;
  -- The second upload in the active chat was never sent.
  update public.media_assets set sent_at=null where path='uploads/chat/00000000-0000-4000-8000-000000000071/00000000-0000-4000-8000-000000000072.webp';
  insert into public.news_posts(slug,title,cover_path,cover_width,cover_height,status)
    values('media-lifecycle-verification','Lifecycle test','news/__lifecycle_saved.jpg',2,2,'draft') returning id into n;
  if not exists(select 1 from public.media_references where source='news_posts' and record_id=n::text and path='news/__lifecycle_saved.jpg') then raise exception 'Draft reference not tracked'; end if;
  -- Reset to an expired timestamp after saving, to test reference protection.
  update public.media_assets set expires_at=now()-interval '2 days' where path='news/__lifecycle_saved.jpg';
  select array_agg(path order by path) into paths from public.claim_media_cleanup(tok,true,1000)
    where path like '%__lifecycle_%';
  if paths is distinct from array['uploads/__lifecycle_expired.jpg','uploads/__lifecycle_old_end.jpg','uploads/__lifecycle_unsent.jpg'] then raise exception 'Unexpected cleanup eligibility: %',paths; end if;
  if exists(select 1 from public.claim_media_cleanup(tok,true,1000) where path='uploads/chat/00000000-0000-4000-8000-000000000071/00000000-0000-4000-8000-000000000071.webp') then raise exception 'Active approval expired'; end if;
  if not exists(select 1 from public.claim_media_cleanup(tok,true,1000) where path='uploads/chat/00000000-0000-4000-8000-000000000071/00000000-0000-4000-8000-000000000072.webp') then raise exception 'Unsent image in active chat did not expire'; end if;
  if exists(select 1 from public.media_assets where path like '%__lifecycle_%' and state <> 'ready') then raise exception 'Dry run modified state'; end if;
  perform public.claim_media_cleanup(tok,false,1000);
  begin
    perform public.pin_media_asset('media','uploads/__lifecycle_expired.jpg');
    raise exception 'Claimed asset accepted a new use';
  exception when raise_exception then if sqlerrm <> 'Photo unavailable' then raise; end if; end;
  perform public.complete_media_cleanup(tok,'media','uploads/__lifecycle_expired.jpg',false);
  if not exists(select 1 from public.media_assets where path='uploads/__lifecycle_expired.jpg' and state='ready' and attempts=1 and last_error is not null) then raise exception 'Failed deletion not retryable'; end if;
  perform public.complete_media_cleanup(tok,'media','uploads/__lifecycle_unsent.jpg',true);
  if not exists(select 1 from public.media_assets where path='uploads/__lifecycle_unsent.jpg' and state='deleted') then raise exception 'Successful deletion not recorded'; end if;
  delete from public.news_posts where id=n;
  if exists(select 1 from public.media_references where source='news_posts' and record_id=n::text) then raise exception 'Deleted reference retained'; end if;
  if not exists(select 1 from public.media_assets where path='news/__lifecycle_saved.jpg' and expires_at>=now()+interval '7 days') then raise exception 'Removed media lacks grace period'; end if;
  if has_function_privilege('anon','public.media_session_event(uuid,text,text)','execute') or has_function_privilege('authenticated','public.claim_media_cleanup(text,boolean,integer)','execute') then raise exception 'Maintenance privileges exposed'; end if;
  if (select public from storage.buckets where id='chat-uploads') then raise exception 'Chat bucket is public'; end if;
end $$;

-- A normal signed-in user cannot read or manipulate the admin registry.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.media_assets) or exists(select 1 from public.media_upload_sessions) then raise exception 'Non-admin can read registry'; end if;
  begin perform public.media_session_event('00000000-0000-4000-8000-000000000099',null,'draft'); raise exception 'Non-admin can create sessions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.pin_media_asset('media','anything'); raise exception 'Anonymous RPC permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
