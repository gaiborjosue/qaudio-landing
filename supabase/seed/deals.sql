-- QDeal content from https://www.qaudio.com/qdeal (October 2026). Run in the
-- SQL editor or through the Supabase MCP server; fixed ids make it safe to
-- re-run, and rows that already exist are left as they are.
insert into public.deals (id, title, summary, note, status, sort_order)
values (
  'ecc51855-b088-4067-a530-ea04098c02b6',
  'Closeouts: great gear, incredible prices.',
  'Limited quantities (new and demos), major savings—shop closeouts while they last.',
  'Visit us for pricing.',
  'published',
  0
)
on conflict (id) do nothing;

insert into public.deal_items (id, deal_id, brand, name, sort_order)
values
  ('17fed908-18a5-413a-a0da-f078cd0ff120', 'ecc51855-b088-4067-a530-ea04098c02b6', 'Sonos', 'Era 100', 1),
  ('05a53cae-cd8d-4c45-a17f-87df2f16488d', 'ecc51855-b088-4067-a530-ea04098c02b6', 'Sonos', 'Era 300', 2),
  ('994092f7-e67b-4999-b595-b7c9537863aa', 'ecc51855-b088-4067-a530-ea04098c02b6', 'Sonos', 'Roam 2', 3),
  ('eecc162f-8a1c-4176-85d2-2b4e2c96cf20', 'ecc51855-b088-4067-a530-ea04098c02b6', 'Sonos', 'Era 100 Pro', 4)
on conflict (id) do nothing;
