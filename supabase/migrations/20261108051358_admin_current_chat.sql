-- Only a pointer and revision live here; Eve retains the conversation.
create table public.admin_chat_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment ~ '^[a-z0-9][a-z0-9:_./-]{0,159}$'),
  session_id text check (session_id ~ '^wrun_[0-9A-Z]{26}$'),
  generation uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key (user_id, environment)
);
alter table public.admin_chat_sessions enable row level security;
revoke all on public.admin_chat_sessions from public, anon, authenticated, service_role;
grant select, insert, update on public.admin_chat_sessions to authenticated;
grant select, insert, update, delete on public.admin_chat_sessions to service_role;
create policy "Admins read their own current chat" on public.admin_chat_sessions
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_admin()));
create policy "Admins create their own current chat" on public.admin_chat_sessions
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_admin()));
create policy "Admins update their own current chat" on public.admin_chat_sessions
  for update to authenticated using (user_id = (select auth.uid()) and (select public.is_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_admin()));

-- Serialize first-message claims and explicit New chat resets across devices.
create function public.admin_chat_session(
  p_environment text, p_event text, p_session_id text default null, p_generation uuid default null
) returns table(session_id text, generation uuid)
language plpgsql security invoker set search_path = '' as $$
declare current_chat public.admin_chat_sessions;
begin
  if auth.uid() is null or not public.is_admin() then raise insufficient_privilege; end if;
  if p_environment is null or p_environment !~ '^[a-z0-9][a-z0-9:_./-]{0,159}$'
    or p_event is null or p_event not in ('prepare','claim','reset')
    or (p_session_id is not null and p_session_id !~ '^wrun_[0-9A-Z]{26}$')
    then raise exception 'Invalid current chat request'; end if;
  if p_event in ('prepare','reset') then
    insert into public.admin_chat_sessions(user_id,environment) values(auth.uid(),p_environment)
      on conflict (user_id,environment) do nothing;
  end if;
  select * into current_chat from public.admin_chat_sessions s
    where s.user_id=auth.uid() and s.environment=p_environment for update;
  if not found then raise exception 'Current chat changed. Reload the dashboard.'; end if;
  if p_event = 'claim' then
    if p_generation is null or p_generation <> current_chat.generation
      or p_session_id is null
      or (current_chat.session_id is not null and current_chat.session_id <> p_session_id)
      then raise exception 'Current chat changed. Reload the dashboard.'; end if;
    update public.admin_chat_sessions s set session_id=p_session_id,updated_at=now()
      where s.user_id=auth.uid() and s.environment=p_environment;
  elsif p_event = 'reset' then
    if (p_generation is null and (current_chat.session_id is not null or p_session_id is not null))
      or (p_generation is not null and p_generation <> current_chat.generation)
      or current_chat.session_id is distinct from p_session_id
      then raise exception 'Current chat changed. Reload the dashboard.'; end if;
    update public.admin_chat_sessions s set session_id=null,generation=gen_random_uuid(),updated_at=now()
      where s.user_id=auth.uid() and s.environment=p_environment;
  end if;
  return query select s.session_id,s.generation from public.admin_chat_sessions s
    where s.user_id=auth.uid() and s.environment=p_environment;
end $$;
revoke all on function public.admin_chat_session(text,text,text,uuid) from public, anon, service_role;
grant execute on function public.admin_chat_session(text,text,text,uuid) to authenticated;
