-- Transactional QDeal image and role checks. All fixtures roll back.
-- No Storage writes or real file deletion.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',(select user_id::text from private.admins limit 1),'role','authenticated')::text, true);
set local role authenticated;

do $$ declare s uuid; p text; destination text; live_id uuid; draft_id uuid; bad text;
begin
  if auth.uid() is null then raise exception 'An admin is required for verification'; end if;
  s := public.media_session_event(gen_random_uuid(),null,'draft');
  p := 'uploads/chat/' || s::text || '/' || gen_random_uuid()::text || '.webp';
  destination := 'deals/' || gen_random_uuid()::text || '.webp';
  perform public.register_media_upload('chat-uploads',p,s);
  perform public.prepare_media_copy('chat-uploads',p,destination);
  if not exists(select 1 from public.media_assets where bucket_id='media' and path=destination and owner_id=auth.uid() and state='ready') then raise exception 'QDeal promotion was not tracked'; end if;

  insert into public.deals(title,status,image_path,image_width,image_height,image_alt)
    values('__QDeal verification image','draft',destination,1200,1800,'Verification flyer') returning id into live_id;
  if not exists(select 1 from public.media_references where source='deals' and record_id=live_id::text and path=destination) then raise exception 'Saved QDeal image is not retained'; end if;
  update public.deals set note='Changed text' where id=live_id;
  if not exists(select 1 from public.deals where id=live_id and image_path=destination) then raise exception 'Text edit removed the image'; end if;
  update public.deals set image_path=null,image_width=null,image_height=null,image_alt='' where id=live_id;
  if exists(select 1 from public.media_references where source='deals' and record_id=live_id::text) then raise exception 'Removed QDeal image is still referenced'; end if;
  update public.deals set image_path=destination,image_width=1200,image_height=1800,image_alt='Verification flyer',status='published' where id=live_id;
  insert into public.deals(title,status) values('__QDeal verification text','draft') returning id into draft_id;
  insert into public.deal_items(deal_id,name,price_cents) values(live_id,'Verification amplifier',50000);
  if not exists(select 1 from public.deal_items where deal_id=live_id) then raise exception 'Image and product combination failed'; end if;

  foreach bad in array array['https://example.com/flyer.jpg','uploads/chat/unplaced.jpg','deals/../flyer.jpg','deals/flyer.svg'] loop
    begin
      update public.deals set image_path=bad where id=live_id;
      raise exception 'Invalid QDeal path was accepted';
    exception when check_violation then null; end;
  end loop;
  update public.deals set image_path='deals/webflow-' || repeat('a',64) || '.webp' where id=live_id;
  update public.deals set image_path='products/verification.jpg' where id=live_id;
  update public.deals set image_path=destination where id=live_id;
  perform set_config('qdeal_verification.live',live_id::text,true);
  perform set_config('qdeal_verification.draft',draft_id::text,true);
end $$;
reset role;

-- Ordinary signed-in users can read the live image, but cannot change deals
-- or promote photos. Draft images stay behind the deal's existing RLS.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
set local role authenticated;
do $$ declare n integer;
begin
  if not exists(select 1 from public.deals where id=current_setting('qdeal_verification.live')::uuid) then raise exception 'Live QDeal is hidden from signed-in visitors'; end if;
  if exists(select 1 from public.deals where id=current_setting('qdeal_verification.draft')::uuid) then raise exception 'Draft QDeal is exposed to signed-in visitors'; end if;
  update public.deals set note='Unauthorized' where id=current_setting('qdeal_verification.live')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Non-admin can change a QDeal'; end if;
  begin
    insert into public.deals(title) values('__Unauthorized verification');
    raise exception 'Non-admin can add a QDeal';
  exception when insufficient_privilege then null; end;
  begin
    perform public.prepare_media_copy('media','deals/verification.jpg','deals/verification-copy.jpg');
    raise exception 'Non-admin can promote media';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  if not exists(select 1 from public.deals where id=current_setting('qdeal_verification.live')::uuid) then raise exception 'Live QDeal is hidden from visitors'; end if;
  if exists(select 1 from public.deals where id=current_setting('qdeal_verification.draft')::uuid) then raise exception 'Draft QDeal is exposed to visitors'; end if;
  if has_table_privilege('anon','public.deals','insert') or has_function_privilege('anon','public.prepare_media_copy(text,text,text)','execute') then raise exception 'Anonymous QDeal writes are permitted'; end if;
end $$;
reset role;

set local role service_role;
do $$ begin
  if not exists(select 1 from public.deals where id=current_setting('qdeal_verification.draft')::uuid) then raise exception 'Maintenance access changed'; end if;
end $$;
reset role;
rollback;
