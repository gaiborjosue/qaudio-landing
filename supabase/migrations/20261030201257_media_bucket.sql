-- Public media bucket for site images (news covers and photos now, products
-- later), organized by folder, e.g. news/<file>.webp. Anyone can load files by
-- their public URL; only admins can list, upload, replace or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760,
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
);

create policy "Admins can list media"
on storage.objects for select
to authenticated
using (bucket_id = 'media' and (select private.is_admin()));

create policy "Admins can upload media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media' and (select private.is_admin()));

create policy "Admins can replace media"
on storage.objects for update
to authenticated
using (bucket_id = 'media' and (select private.is_admin()))
with check (bucket_id = 'media' and (select private.is_admin()));

create policy "Admins can delete media"
on storage.objects for delete
to authenticated
using (bucket_id = 'media' and (select private.is_admin()));
