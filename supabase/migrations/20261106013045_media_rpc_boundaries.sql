-- Exposed RPCs run as the caller; privileged state transitions stay in the
-- unexposed schema, with explicit admin and owner checks in every helper.
alter function public.media_session_event(uuid,text,text) set schema private;
alter function public.register_media_upload(text,text,uuid) set schema private;
alter function public.pin_media_asset(text,text) set schema private;
alter function public.prepare_media_copy(text,text,text) set schema private;
alter function public.discard_media_upload(text,text) set schema private;
alter function public.set_instagram_media(text,text[]) set schema private;

create function public.media_session_event(p_id uuid,p_eve text default null,p_event text default 'draft')
returns uuid language sql security invoker set search_path = '' as $$ select private.media_session_event(p_id,p_eve,p_event) $$;
create function public.register_media_upload(p_bucket text,p_path text,p_session uuid default null)
returns void language sql security invoker set search_path = '' as $$ select private.register_media_upload(p_bucket,p_path,p_session) $$;
create function public.pin_media_asset(p_bucket text,p_path text)
returns void language sql security invoker set search_path = '' as $$ select private.pin_media_asset(p_bucket,p_path) $$;
create function public.prepare_media_copy(p_bucket text,p_path text,p_destination text)
returns void language sql security invoker set search_path = '' as $$ select private.prepare_media_copy(p_bucket,p_path,p_destination) $$;
create function public.discard_media_upload(p_bucket text,p_path text)
returns void language sql security invoker set search_path = '' as $$ select private.discard_media_upload(p_bucket,p_path) $$;
create function public.set_instagram_media(p_id text,p_paths text[])
returns void language sql security invoker set search_path = '' as $$ select private.set_instagram_media(p_id,p_paths) $$;

revoke all on function public.media_session_event(uuid,text,text),public.register_media_upload(text,text,uuid),public.pin_media_asset(text,text),public.prepare_media_copy(text,text,text),public.discard_media_upload(text,text),public.set_instagram_media(text,text[]) from public,anon;
grant execute on function public.media_session_event(uuid,text,text),public.register_media_upload(text,text,uuid),public.pin_media_asset(text,text),public.prepare_media_copy(text,text,text),public.discard_media_upload(text,text),public.set_instagram_media(text,text[]) to authenticated;
