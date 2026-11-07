-- PROPOSED ONLY. Stage 1 does not apply this SQL. After review, apply exactly
-- this SQL and save it as supabase/migrations/<actual applied version>_webflow_content.sql.
-- Existing grants/RLS continue to cover changed columns.
alter table public.catalog_brands add column featured boolean not null default false;
alter table public.catalog_brands alter column logo_path drop not null;
alter table public.products alter column brand_slug drop not null;
alter table public.products alter column price_cents drop not null;
alter table public.products drop constraint products_short_description_check;
alter table public.products add constraint products_short_description_check check (char_length(short_description) <= 1000);
alter table public.products add column price_note text not null default '' check (char_length(price_note) <= 500);
alter table public.products add column condition_note text not null default '' check (char_length(condition_note) <= 500);
alter table public.products add column availability text not null default 'available' check (availability in ('available','sold','unavailable'));
alter table public.products add constraint products_sale_requires_price check (sale_price_cents is null or price_cents is not null);
alter table public.product_images add column caption text not null default '' check (char_length(caption) <= 2000);
alter table public.deals add column image_path text check (image_path ~ '^deals/webflow-[a-f0-9]{64}\.webp$');
alter table public.deals add column image_width integer check (image_width > 0);
alter table public.deals add column image_height integer check (image_height > 0);
alter table public.deals add column image_alt text not null default '';
alter table public.deals add constraint deals_image_dimensions check ((image_path is null and image_width is null and image_height is null) or (image_path is not null and image_width is not null and image_height is not null));

-- A trusted-host importer ledger, never exposed to visitors or the agent.
-- No raw exports, source HTML, credentials, or provider payloads live here.
create table public.webflow_import_records (
  collection_id text not null,
  item_id text not null,
  source_slug text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  target_table text not null check (target_table in ('products','news_posts','deals','catalog_brands','catalog_categories','static')),
  target_key text not null,
  target_fingerprint text not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz not null default now(),
  primary key (collection_id,item_id)
);
alter table public.webflow_import_records enable row level security;
revoke all on public.webflow_import_records from public, anon, authenticated;
grant select, insert on public.webflow_import_records to service_role;
comment on table public.webflow_import_records is 'Immutable import receipt. Compare source and target fingerprints on repeat; never overwrite subsequent admin edits.';
