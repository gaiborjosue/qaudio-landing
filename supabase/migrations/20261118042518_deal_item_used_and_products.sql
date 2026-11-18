-- Deal rows can be used gear, and can point at the shop product they are,
-- so the row links to its page.
alter table public.deal_items drop constraint deal_items_condition_check;
alter table public.deal_items add constraint deal_items_condition_check
  check (condition in ('new', 'demo', 'used'));
comment on column public.deal_items.condition is 'Optional: new, demo, or used.';

alter table public.deal_items
  add column product_id uuid references public.products (id) on delete set null;
comment on column public.deal_items.product_id is 'Optional: the shop product this row is; the row links to its page while it''s published.';

-- Serves the foreign key when a product is deleted.
create index deal_items_product_id_idx
  on public.deal_items (product_id) where product_id is not null;
