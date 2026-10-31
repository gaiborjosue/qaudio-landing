-- Storefront taxonomy mirrors lib/categories.ts and lib/brands.ts slugs/assets.
create table public.catalog_categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  artwork_path text not null check (artwork_path like '/categories/%'),
  sort_order integer not null default 0
);
create table public.catalog_brands (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  logo_path text not null check (logo_path like '/brands/%'),
  sort_order integer not null default 0
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_slug text not null references public.catalog_categories(slug),
  brand_slug text not null references public.catalog_brands(slug),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  short_description text not null default '' check (char_length(short_description) <= 300),
  description_intro text not null default '',
  features text[] not null default '{}',
  description_closing text not null default '',
  price_cents integer not null check (price_cents > 0),
  msrp_cents integer check (msrp_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  price_unit text not null default 'each' check (price_unit in ('each', 'pair')),
  condition text not null check (condition in ('New', 'Demo', 'Used')),
  ready_for_audition boolean not null default false,
  manufacturer_url text check (manufacturer_url ~ '^https://[^/[:space:]]+'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_slug, sort_order, id);
create index products_brand_idx on public.products(brand_slug, sort_order, id);
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
comment on column public.products.msrp_cents is 'Manufacturer base list price in US cents. Orbit Theory: $999 verified 2026-10-31; options may cost more.';
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path text not null check (path like 'products/%'),
  alt text not null check (char_length(btrim(alt)) between 1 and 300),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  unique (product_id, sort_order)
);
comment on table public.product_images is 'Ordered media bucket images; the first image is the listing thumbnail and gallery lead.';

alter table public.catalog_categories enable row level security;
alter table public.catalog_brands enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
grant select on public.catalog_categories, public.catalog_brands, public.products, public.product_images to anon;
grant select, insert, update, delete on public.catalog_categories, public.catalog_brands, public.products, public.product_images to authenticated, service_role;

create policy "Public categories" on public.catalog_categories for select to anon, authenticated using (true);
create policy "Public brands" on public.catalog_brands for select to anon, authenticated using (true);
create policy "Published products" on public.products for select to anon using (status = 'published');
create policy "Published products or admin" on public.products for select to authenticated using (status = 'published' or (select private.is_admin()));
create policy "Images follow product visibility" on public.product_images for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_images.product_id));

-- Separate write policies avoid overlapping permissive SELECT policies.
DO $$
declare table_name text;
begin
  foreach table_name in array array['catalog_categories', 'catalog_brands', 'products', 'product_images'] loop
    execute format('create policy "Admins insert" on public.%I for insert to authenticated with check ((select private.is_admin()))', table_name);
    execute format('create policy "Admins update" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', table_name);
    execute format('create policy "Admins delete" on public.%I for delete to authenticated using ((select private.is_admin()))', table_name);
  end loop;
end $$;

insert into public.catalog_categories (slug, name, artwork_path, sort_order) values
('amplifiers', 'Amplifiers', '/categories/amplifiers.png', 0),
('av-furniture', 'AV Furniture', '/categories/av-furniture.png', 1),
('cables', 'Cables', '/categories/cables.png', 2),
('cd-sacd', 'CD / SACD Players', '/categories/cd-sacd.png', 3),
('thorens-parts', 'Genuine Thorens Parts', '/categories/thorens-parts.png', 4),
('headphones', 'Headphones', '/categories/headphones.png', 5),
('network-players', 'Network Players, Hi-Res Audio & DACs', '/categories/network-players.png', 6),
('phono-cartridges', 'Phono Cartridges', '/categories/phono-cartridges.png', 7),
('preamplifiers', 'Preamplifiers & Processors', '/categories/preamplifiers.svg', 8),
('receivers', 'Receivers', '/categories/receivers.png', 9),
('speakers', 'Speakers', '/categories/speakers.png', 10),
('subwoofers', 'Subwoofers', '/categories/subwoofers.svg', 11),
('turntables', 'Turntables', '/categories/turntables.png', 12),
('used-equipment', 'Used Equipment', '/categories/used-equipment.png', 13);

insert into public.catalog_brands (slug, name, logo_path, sort_order) values
('bluesound', 'Bluesound', '/brands/bluesound.png', 0),
('denon', 'Denon', '/brands/denon.png', 1),
('kimber-kable', 'Kimber Kable', '/brands/kimber-kable.png', 2),
('klipsch', 'Klipsch', '/brands/klipsch.png', 3),
('marantz', 'Marantz', '/brands/marantz.png', 4),
('musical-fidelity', 'Musical Fidelity', '/brands/musical-fidelity.png', 5),
('ortofon', 'Ortofon', '/brands/ortofon.png', 6),
('parasound', 'Parasound', '/brands/parasound.png', 7),
('salamander-designs', 'Salamander Designs', '/brands/salamander-designs.png', 8),
('sonos', 'Sonos', '/brands/sonos.png', 9),
('thorens', 'Thorens', '/brands/thorens.png', 10),
('pro-ject', 'Pro-Ject', '/brands/pro-ject.png', 11),
('paradigm', 'Paradigm', '/brands/paradigm.png', 12),
('sumiko', 'Sumiko', '/brands/sumiko.png', 13),
('grado', 'Grado', '/brands/grado.png', 14),
('anthem', 'Anthem', '/brands/anthem.png', 15),
('nad', 'NAD', '/brands/nad.png', 16),
('heos', 'HEOS', '/brands/heos.png', 17),
('andover-audio', 'Andover Audio', '/brands/andover-audio.png', 18),
('kef', 'KEF', '/brands/kef.png', 19),
('klh', 'KLH', '/brands/klh.svg', 20),
('u-turn-audio', 'U-Turn Audio', '/brands/u-turn-audio.jpg', 21),
('dali', 'Dali', '/brands/dali.png', 22);
