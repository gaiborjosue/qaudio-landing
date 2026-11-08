-- QDeal images can come from chat uploads or existing public media.
-- Existing table grants, RLS, and media-reference triggers still apply.
alter table public.deals drop constraint deals_image_path_check;
alter table public.deals add constraint deals_image_path_check check (
  image_path is null or (
    char_length(image_path) <= 300
    and image_path ~* '^(deals|products|news|instagram)/[a-z0-9_.-]+(/[a-z0-9_.-]+)*[.](webp|jpe?g|png|gif)$'
    and image_path !~ '(^|/)[.][.]?(/|$)'
  )
);

-- Keep uploads private until an approved save promotes them into deals/.
-- The existing helper checks admin access and ownership through pin_media_asset.
create or replace function private.prepare_media_copy(p_bucket text,p_path text,p_destination text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.pin_media_asset(p_bucket,p_path);
  if p_destination !~ '^(products|news|deals|instagram|categories|brands|category-scenes)/[0-9a-zA-Z_.-]+$' then raise exception 'Invalid media destination'; end if;
  insert into public.media_assets(bucket_id,path,owner_id,expires_at,lease_until)
    values('media',p_destination,auth.uid(),now()+interval '7 days',now()+interval '15 minutes') on conflict do nothing;
  perform public.pin_media_asset('media',p_destination);
end $$;
