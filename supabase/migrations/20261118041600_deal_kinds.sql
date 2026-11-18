-- QDeals (/qdeal) are Q Audio-only opportunities; featured sales (/sales)
-- are promotions shown above the products on sale.
alter table public.deals
  add column kind text not null default 'qdeal'
  check (kind in ('qdeal', 'sale'));

comment on table public.deals is 'QDeal promotions (/qdeal) and featured sales (/sales), lowest sort_order first.';
comment on column public.deals.kind is 'qdeal: a Q Audio-only opportunity on /qdeal; sale: a featured sale promotion on /sales.';

-- Bronze November is a brand promotion: it moves to /sales.
update public.deals set kind = 'sale' where title = 'Bronze November';
