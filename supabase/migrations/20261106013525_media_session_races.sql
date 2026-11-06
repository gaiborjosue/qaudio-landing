create or replace function private.media_session_event(p_id uuid, p_eve text default null, p_event text default 'draft')
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.media_upload_sessions; uid uuid := auth.uid();
begin
  if not private.is_admin() or uid is null then raise insufficient_privilege; end if;
  if p_event not in ('draft','active','settled','ended') or length(coalesce(p_eve,'')) > 200 then raise exception 'Invalid media session'; end if;
  if p_eve is not null then select * into s from public.media_upload_sessions where eve_session_id = p_eve for update; end if;
  if s.id is null and p_id is not null then select * into s from public.media_upload_sessions where id = p_id for update; end if;
  if s.id is null then
    insert into public.media_upload_sessions(id,owner_id,eve_session_id) values(coalesce(p_id,gen_random_uuid()),uid,p_eve) on conflict do nothing returning * into s;
    if s.id is null and p_eve is not null then select * into s from public.media_upload_sessions where eve_session_id=p_eve for update; end if;
    if s.id is null and p_id is not null then select * into s from public.media_upload_sessions where id=p_id for update; end if;
    if s.id is null then raise exception 'Photo session unavailable'; end if;
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
