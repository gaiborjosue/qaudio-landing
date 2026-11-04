-- Run as database owner. Every probe and reorder rolls back.
begin;
create temp table metadata_results (role_name text, check_name text, passed boolean);
select set_config('metadata_test.admin', (select user_id::text from private.admins limit 1), true);
insert into public.catalog_categories(slug, name, wheel_label, artwork_path, scene_path)
values ('metadata-access-category', 'Probe', 'Probe', 'categories/00000000-0000-4000-8000-000000000001.webp', 'category-scenes/00000000-0000-4000-8000-000000000002.webp');
insert into public.catalog_brands(slug, name, logo_path)
values ('metadata-access-brand', 'Probe', 'brands/00000000-0000-4000-8000-000000000003.webp');
insert into public.products(slug, name, category_slug, brand_slug, price_cents, condition, status)
values ('metadata-access-product', 'Probe draft', 'metadata-access-category', 'metadata-access-brand', 100, 'New', 'draft');

create function pg_temp.probe_metadata(role_name text, may_reorder boolean) returns void language plpgsql as $$
declare slugs text[]; ok boolean;
begin
  select array_agg(slug order by sort_order, slug) into slugs from public.catalog_brands;
  begin
    perform public.reorder_catalog_metadata('brands', slugs, slugs);
    ok := may_reorder;
  exception when insufficient_privilege then ok := not may_reorder;
  end;
  insert into pg_temp.metadata_results values(role_name, 'reorder authorization', ok);
  if not may_reorder then return; end if;
  begin
    perform public.reorder_catalog_metadata('brands', '{}'::text[], slugs); ok := false;
  exception when serialization_failure then ok := true;
  end;
  insert into pg_temp.metadata_results values(role_name, 'stale order refused', ok);
  begin
    perform public.reorder_catalog_metadata('brands', slugs, array[slugs[1], slugs[1]]); ok := false;
  exception when invalid_parameter_value then ok := true;
  end;
  insert into pg_temp.metadata_results values(role_name, 'incomplete order refused', ok);
  begin
    update public.catalog_brands set slug = 'metadata-access-renamed' where slug = 'metadata-access-brand'; ok := false;
  exception when check_violation then ok := true;
  end;
  insert into pg_temp.metadata_results values(role_name, 'slug is immutable', ok);
  begin
    delete from public.catalog_categories where slug = 'used-equipment'; ok := false;
  exception when check_violation then ok := true;
  end;
  insert into pg_temp.metadata_results values(role_name, 'Used Equipment protected', ok);
  begin
    delete from public.catalog_brands where slug = 'metadata-access-brand'; ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  insert into pg_temp.metadata_results values(role_name, 'draft products prevent deletion', ok);
end;
$$;
grant select, insert on metadata_results to anon, authenticated, service_role;
grant execute on function pg_temp.probe_metadata(text, boolean) to anon, authenticated, service_role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.probe_metadata('anon', false);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);
select pg_temp.probe_metadata('non-admin', false);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('metadata_test.admin'))::text, true);
select pg_temp.probe_metadata('admin', true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.probe_metadata('service_role', false);
reset role;
do $$ declare failures text; begin
  select string_agg(role_name || ': ' || check_name, '; ') into failures from pg_temp.metadata_results where not passed;
  if failures is not null then raise exception 'Metadata checks failed: %', failures; end if;
end $$;
rollback;
select 'Metadata access checks passed' as result,
  (select count(*) from public.catalog_categories where slug like 'metadata-access-%') +
  (select count(*) from public.catalog_brands where slug like 'metadata-access-%') +
  (select count(*) from public.products where slug like 'metadata-access-%') as probe_rows_left;
