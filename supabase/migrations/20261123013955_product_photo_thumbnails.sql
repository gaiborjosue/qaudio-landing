-- The existing media reference trigger tracks every media path in the row.
-- Derive the variant from the original so replacing or reordering photos
-- retains exactly the matching thumbnail, including during rolling deploys.
alter table public.product_images
  add column thumbnail_path text generated always as (
    case when path ~ '^products/photo-v1-[0-9a-f-]{36}\.(webp|jpg)$'
      then path || '.thumb.webp'
    end
  ) stored;
