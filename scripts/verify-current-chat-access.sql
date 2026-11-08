-- Role and cross-device revision checks; all records are rolled back.
begin;
select set_config('qaudio.verify.owner',(select user_id::text from private.admins limit 1),true);
select set_config('qaudio.verify.other',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('qaudio.verify.other')::uuid,'qaudio-chat-verification@example.invalid');
insert into private.admins(user_id) values(current_setting('qaudio.verify.other')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qaudio.verify.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare initial record; next_chat record; isolated record; r record; a text := 'wrun_' || repeat('1',26); b text := 'wrun_' || repeat('2',26);
begin
  select * into initial from public.admin_chat_session('verification:chat','prepare');
  if initial.session_id is not null then raise exception 'Verification namespace is not empty'; end if;
  perform public.admin_chat_session('verification:chat','claim',a,initial.generation);
  select * into r from public.admin_chat_session('verification:chat','prepare');
  if r.session_id <> a or r.generation <> initial.generation then raise exception 'Another device did not find the current chat'; end if;
  begin
    perform public.admin_chat_session('verification:chat','claim',b,initial.generation);
    raise exception 'Concurrent device replaced the chat';
  exception when raise_exception then if sqlerrm <> 'Current chat changed. Reload the dashboard.' then raise; end if; end;
  select * into next_chat from public.admin_chat_session('verification:chat','reset',a,initial.generation);
  if next_chat.session_id is not null or next_chat.generation = initial.generation then raise exception 'New chat did not rotate the revision'; end if;
  begin
    perform public.admin_chat_session('verification:chat','claim',a,initial.generation);
    raise exception 'Late old session resurrected itself';
  exception when raise_exception then if sqlerrm <> 'Current chat changed. Reload the dashboard.' then raise; end if; end;
  perform public.admin_chat_session('verification:chat','claim',b,next_chat.generation);
  begin
    perform public.admin_chat_session('verification:chat','reset',a,initial.generation);
    raise exception 'Stale device cleared the new chat';
  exception when raise_exception then if sqlerrm <> 'Current chat changed. Reload the dashboard.' then raise; end if; end;
  select * into isolated from public.admin_chat_session('verification:other-environment','prepare');
  if isolated.session_id is not null or isolated.generation = next_chat.generation then raise exception 'Environment state leaked'; end if;
  if not exists(select 1 from public.admin_chat_sessions where user_id=auth.uid() and environment='verification:chat' and session_id=b) then raise exception 'Current chat changed across environments'; end if;
  begin
    update public.admin_chat_sessions set user_id=current_setting('qaudio.verify.other')::uuid where user_id=auth.uid() and environment='verification:chat';
    raise exception 'Owner could reassign another admin';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qaudio.verify.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare r record;
begin
  if exists(select 1 from public.admin_chat_sessions where user_id=current_setting('qaudio.verify.owner')::uuid) then raise exception 'Another admin can read the owner chat'; end if;
  select * into r from public.admin_chat_session('verification:chat','prepare');
  if r.session_id is not null then raise exception 'Admin inherited another admin chat'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.admin_chat_sessions) then raise exception 'Non-admin can read chat pointers'; end if;
  begin
    perform public.admin_chat_session('verification:chat','prepare');
    raise exception 'Non-admin can create chat state';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  if has_table_privilege('anon','public.admin_chat_sessions','select') or has_function_privilege('anon','public.admin_chat_session(text,text,text,uuid)','execute') then raise exception 'Anonymous chat access is exposed'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  if not exists(select 1 from public.admin_chat_sessions where user_id=current_setting('qaudio.verify.owner')::uuid and environment='verification:chat') then raise exception 'Maintenance access is missing'; end if;
end $$;
reset role;
rollback;
