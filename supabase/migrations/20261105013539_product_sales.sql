-- Time-limited sales. price_cents stays the regular selling price and
-- msrp_cents the list price; the sale price applies only inside its window,
-- so a sale ends by itself with no job at the deadline. A sale always has an
-- end, and costs less than the regular price.
alter table public.products
  add column sale_price_cents integer check (sale_price_cents > 0),
  add column sale_starts_at timestamptz,
  add column sale_ends_at timestamptz,
  add constraint products_sale_window check (
    (sale_price_cents is null and sale_starts_at is null and sale_ends_at is null)
    or (
      sale_price_cents is not null
      and sale_ends_at is not null
      and sale_price_cents < price_cents
      and (sale_starts_at is null or sale_starts_at < sale_ends_at)
    )
  );

comment on column public.products.sale_price_cents is
  'Sale price in US cents, shown instead of price_cents from sale_starts_at (or at once, when null) until sale_ends_at.';
comment on column public.products.sale_starts_at is
  'When the sale price starts showing; null means as soon as it is saved.';
comment on column public.products.sale_ends_at is
  'When the sale price stops showing; required with a sale price.';
