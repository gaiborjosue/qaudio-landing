alter table public.products
  drop constraint products_availability_check,
  add constraint products_availability_check
    check (availability in ('available', 'back_order', 'sold', 'unavailable'));
