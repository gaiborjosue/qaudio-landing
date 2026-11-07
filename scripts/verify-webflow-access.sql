-- Run after applying the proposed Webflow schema. Read-only role probes.
begin;
do $$ begin
  if has_table_privilege('anon','public.webflow_import_records','select') or
     has_table_privilege('authenticated','public.webflow_import_records','select') or
     has_table_privilege('authenticated','public.webflow_import_records','insert') or
     has_table_privilege('service_role','public.webflow_import_records','update') then
    raise exception 'Import ledger must be immutable and private to the importer';
  end if;
  if not (has_table_privilege('service_role','public.webflow_import_records','select') and has_table_privilege('service_role','public.webflow_import_records','insert')) then raise exception 'Importer ledger grants missing'; end if;
  if not (select relrowsecurity from pg_class where oid='public.webflow_import_records'::regclass) then raise exception 'Ledger RLS missing'; end if;
end $$;
set local role anon;
select slug, featured, logo_path from public.catalog_brands order by slug;
select slug,brand_slug,price_cents,availability,price_note,condition_note from public.products order by slug;
select caption from public.product_images limit 1;
select image_path,image_width,image_height,image_alt from public.deals;
reset role;
-- Existing verify-catalog/metadata/media-access.sql probes anon, signed-in
-- non-admin, admin, and service_role writes and visibility, including drafts.
select 'Webflow access checks passed' as result;
rollback;
