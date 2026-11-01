-- Catalog access regression checks. Run the whole file as the database owner
-- (SQL editor or MCP). Expected counts are read from the live tables first,
-- so the checks keep working as the catalog grows. Every probe row and write
-- is rolled back; any failure raises one error naming the failed checks.
begin;

create temp table catalog_access_results (
  role_name text,
  check_name text,
  passed boolean
);
create temp table catalog_access_writes (
  table_name text,
  insert_sql text,
  update_sql text,
  delete_sql text,
  update_all_sql text,
  delete_all_sql text
);

-- A hidden draft product with one photo, under the first category and brand.
insert into public.products (slug, category_slug, brand_slug, name, price_cents, condition, status)
select
  'catalog-access-draft',
  (select slug from public.catalog_categories order by sort_order, slug limit 1),
  (select slug from public.catalog_brands order by sort_order, slug limit 1),
  'Access probe (draft)',
  100,
  'New',
  'draft';
insert into public.product_images (product_id, path, alt, width, height)
select id, 'products/catalog-access-draft.webp', 'Access probe', 1, 1
from public.products
where slug = 'catalog-access-draft';

-- What each role should see, counted as the owner (RLS doesn't apply).
select
  set_config('catalog_test.admin', coalesce((select user_id::text from private.admins limit 1), ''), true),
  set_config('catalog_test.categories', (select count(*)::text from public.catalog_categories), true),
  set_config('catalog_test.brands', (select count(*)::text from public.catalog_brands), true),
  set_config('catalog_test.products', (select count(*)::text from public.products), true),
  set_config('catalog_test.images', (select count(*)::text from public.product_images), true),
  set_config('catalog_test.published', (select count(*)::text from public.products where status = 'published'), true),
  set_config(
    'catalog_test.published_images',
    (
      select count(*)::text
      from public.product_images i
      join public.products p on p.id = i.product_id
      where p.status = 'published'
    ),
    true
  );

-- Writers run the scoped statements on their own probe rows; everyone else
-- must be refused, or match no rows, on the whole table.
insert into catalog_access_writes
select
  'catalog_categories',
  $q$insert into public.catalog_categories (slug, name, wheel_label, artwork_path, scene_path) values ('catalog-access-write', 'Probe', 'Probe', '/categories/probe.png', '/category-scenes/probe.jpg')$q$,
  $q$update public.catalog_categories set name = name where slug = 'catalog-access-write'$q$,
  $q$delete from public.catalog_categories where slug = 'catalog-access-write'$q$,
  $q$update public.catalog_categories set name = name$q$,
  $q$delete from public.catalog_categories$q$
union all
select
  'catalog_brands',
  $q$insert into public.catalog_brands (slug, name, logo_path) values ('catalog-access-write', 'Probe', '/brands/probe.png')$q$,
  $q$update public.catalog_brands set name = name where slug = 'catalog-access-write'$q$,
  $q$delete from public.catalog_brands where slug = 'catalog-access-write'$q$,
  $q$update public.catalog_brands set name = name$q$,
  $q$delete from public.catalog_brands$q$
union all
select
  'products',
  format(
    $q$insert into public.products (slug, category_slug, brand_slug, name, price_cents, condition) values ('catalog-access-write', %L, %L, 'Probe', 100, 'New')$q$,
    p.category_slug,
    p.brand_slug
  ),
  $q$update public.products set name = name where slug = 'catalog-access-write'$q$,
  $q$delete from public.products where slug = 'catalog-access-write'$q$,
  $q$update public.products set name = name$q$,
  $q$delete from public.products$q$
from public.products p
where p.slug = 'catalog-access-draft'
union all
select
  'product_images',
  format(
    $q$insert into public.product_images (product_id, path, alt, width, height, sort_order) values (%L, 'products/catalog-access-write.webp', 'Probe', 1, 1, 1)$q$,
    p.id
  ),
  format($q$update public.product_images set alt = alt where product_id = %L and sort_order = 1$q$, p.id),
  format($q$delete from public.product_images where product_id = %L and sort_order = 1$q$, p.id),
  $q$update public.product_images set alt = alt$q$,
  $q$delete from public.product_images$q$
from public.products p
where p.slug = 'catalog-access-draft';

-- Runs as the caller (security invoker), so RLS and grants apply.
create function pg_temp.check_catalog_access(role_name text, sees_drafts boolean, may_write boolean)
returns void
language plpgsql
as $fn$
declare
  w record;
  n bigint;
  ok boolean;
begin
  insert into pg_temp.catalog_access_results values (
    role_name,
    'reads every category and brand',
    (select count(*) from public.catalog_categories) = current_setting('catalog_test.categories')::bigint
      and (select count(*) from public.catalog_brands) = current_setting('catalog_test.brands')::bigint
  );

  if sees_drafts then
    insert into pg_temp.catalog_access_results values (
      role_name,
      'reads every product and image',
      (select count(*) from public.products) = current_setting('catalog_test.products')::bigint
        and (select count(*) from public.product_images) = current_setting('catalog_test.images')::bigint
    );
  else
    insert into pg_temp.catalog_access_results values (
      role_name,
      'reads only published products and their images',
      (select count(*) from public.products) = current_setting('catalog_test.published')::bigint
        and not exists (select 1 from public.products where status <> 'published')
        and (select count(*) from public.product_images) = current_setting('catalog_test.published_images')::bigint
    );
  end if;

  for w in select * from pg_temp.catalog_access_writes loop
    if may_write then
      begin
        execute w.insert_sql;
        get diagnostics n = row_count;
        ok := n = 1;
        execute w.update_sql;
        get diagnostics n = row_count;
        ok := ok and n = 1;
        execute w.delete_sql;
        get diagnostics n = row_count;
        ok := ok and n = 1;
      exception when insufficient_privilege then
        ok := false;
      end;
      insert into pg_temp.catalog_access_results
      values (role_name, w.table_name || ': insert, update, delete allowed', ok);
    else
      begin
        execute w.insert_sql;
        ok := false;
      exception when insufficient_privilege then
        ok := true;
      end;
      insert into pg_temp.catalog_access_results
      values (role_name, w.table_name || ': insert denied', ok);

      begin
        execute w.update_all_sql;
        get diagnostics n = row_count;
        ok := n = 0;
      exception when insufficient_privilege then
        ok := true;
      end;
      insert into pg_temp.catalog_access_results
      values (role_name, w.table_name || ': update denied', ok);

      begin
        execute w.delete_all_sql;
        get diagnostics n = row_count;
        ok := n = 0;
      exception when insufficient_privilege then
        ok := true;
      end;
      insert into pg_temp.catalog_access_results
      values (role_name, w.table_name || ': delete denied', ok);
    end if;
  end loop;
end
$fn$;

grant select, insert on catalog_access_results to anon, authenticated, service_role;
grant select on catalog_access_writes to anon, authenticated, service_role;
grant execute on function pg_temp.check_catalog_access(text, boolean, boolean)
  to anon, authenticated, service_role;

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select pg_temp.check_catalog_access('anon', false, false);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'authenticated', 'sub', '00000000-0000-0000-0000-000000000001')::text,
  true
);
select pg_temp.check_catalog_access('signed-in non-admin', false, false);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'authenticated', 'sub', nullif(current_setting('catalog_test.admin'), ''))::text,
  true
);
select pg_temp.check_catalog_access('admin', true, true);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select pg_temp.check_catalog_access('service_role', true, true);
reset role;

do $$
declare
  failures text;
begin
  select string_agg(role_name || ': ' || check_name, '; ' order by role_name, check_name)
  into failures
  from pg_temp.catalog_access_results
  where not passed;
  if failures is not null then
    raise exception 'Catalog access checks failed: %', failures;
  end if;
end
$$;

rollback;

-- Reached only when every check passed.
select
  'Catalog access checks passed' as result,
  (select count(*) from public.products where slug like 'catalog-access-%') as probe_rows_left;
