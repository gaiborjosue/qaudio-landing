-- QDeal promotions (/qdeal), such as closeouts, and the products each lists.

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 600),
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_window check (
    starts_at is null or ends_at is null or starts_at < ends_at
  )
);

comment on table public.deals is 'QDeal promotions for /qdeal, lowest sort_order first.';
comment on column public.deals.summary is 'Short description under the title.';
comment on column public.deals.note is 'Closing line under the products, such as "Visit us for pricing."';
comment on column public.deals.starts_at is 'Optional: a published deal stays hidden until this time.';
comment on column public.deals.ends_at is 'Optional: a published deal is hidden from this time on.';

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function private.set_updated_at();

create table public.deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  brand text not null default '' check (char_length(brand) <= 80),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  condition text check (condition in ('new', 'demo')),
  price_cents integer check (price_cents > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deal_items is 'Products listed in a QDeal promotion, lowest sort_order first.';
comment on column public.deal_items.condition is 'Optional: new or demo.';
comment on column public.deal_items.price_cents is 'Optional price in US cents; empty shows no price.';

-- Serves the foreign key and the per-deal product order.
create index deal_items_deal_id_idx on public.deal_items (deal_id, sort_order);

create trigger deal_items_set_updated_at
  before update on public.deal_items
  for each row execute function private.set_updated_at();

alter table public.deals enable row level security;
alter table public.deal_items enable row level security;

grant select on table public.deals, public.deal_items to anon;
grant select, insert, update, delete on table public.deals, public.deal_items to authenticated;
grant select, insert, update, delete on table public.deals, public.deal_items to service_role;

create policy "Anyone can read live deals"
on public.deals for select
to anon
using (
  status = 'published'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

create policy "Signed-in users read live deals; admins read all"
on public.deals for select
to authenticated
using (
  (
    status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  )
  or (select private.is_admin())
);

create policy "Admins can add deals"
on public.deals for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admins can edit deals"
on public.deals for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete deals"
on public.deals for delete
to authenticated
using ((select private.is_admin()));

-- Products follow their deal: the subquery runs under the deals policies
-- above, so it only finds deals the caller may read.
create policy "Products of readable deals are readable"
on public.deal_items for select
to anon, authenticated
using (exists (select 1 from public.deals as d where d.id = deal_items.deal_id));

create policy "Admins can add deal products"
on public.deal_items for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admins can edit deal products"
on public.deal_items for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete deal products"
on public.deal_items for delete
to authenticated
using ((select private.is_admin()));
