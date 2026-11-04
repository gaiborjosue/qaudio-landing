-- Keep bundled catalog assets valid while new artwork lives in Storage.
alter table public.catalog_categories drop constraint catalog_categories_artwork_path_check;
alter table public.catalog_categories add constraint catalog_categories_artwork_path_check
  check (artwork_path like '/categories/%' or artwork_path ~ '^categories/[0-9a-f-]{36}\.webp$');
alter table public.catalog_categories drop constraint catalog_categories_scene_path_check;
alter table public.catalog_categories add constraint catalog_categories_scene_path_check
  check (scene_path like '/category-scenes/%' or scene_path ~ '^category-scenes/[0-9a-f-]{36}\.webp$');
alter table public.catalog_brands drop constraint catalog_brands_logo_path_check;
alter table public.catalog_brands add constraint catalog_brands_logo_path_check
  check (logo_path like '/brands/%' or logo_path ~ '^brands/[0-9a-f-]{36}\.webp$');

-- Slugs are public addresses and foreign keys. The Used Equipment page is
-- also linked by fixed navigation and has category-specific content.
create function private.protect_catalog_metadata()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    raise exception 'Catalog addresses cannot change' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    if tg_table_name = 'catalog_categories' and old.slug = 'used-equipment' then
      raise exception 'Used Equipment is required by site navigation' using errcode = '23514';
    end if;
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_catalog_metadata() from public, anon, authenticated;
create trigger protect_catalog_categories before update or delete on public.catalog_categories
for each row execute function private.protect_catalog_metadata();
create trigger protect_catalog_brands before update or delete on public.catalog_brands
for each row execute function private.protect_catalog_metadata();

-- Complete, optimistic orders: no partial saves or silently lost ordering.
-- This function uses the caller's grants and RLS, and checks admin itself.
create function public.reorder_catalog_metadata(kind text, expected text[], ordered text[])
returns void language plpgsql security invoker set search_path = '' as $$
declare current_order text[];
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  if kind = 'categories' then
    lock table public.catalog_categories in share row exclusive mode;
    select coalesce(array_agg(slug order by sort_order, slug), '{}'::text[]) into current_order from public.catalog_categories;
  elsif kind = 'brands' then
    lock table public.catalog_brands in share row exclusive mode;
    select coalesce(array_agg(slug order by sort_order, slug), '{}'::text[]) into current_order from public.catalog_brands;
  else raise exception 'Invalid list' using errcode = '22023'; end if;
  if expected is distinct from current_order then
    raise exception 'Catalog list changed' using errcode = '40001';
  end if;
  if ordered is null or cardinality(ordered) <> cardinality(current_order)
    or cardinality(ordered) <> (select count(distinct slug) from unnest(ordered) as t(slug))
    or not (ordered @> current_order and current_order @> ordered) then
    raise exception 'Order must contain every entry exactly once' using errcode = '22023';
  end if;
  if kind = 'categories' then
    update public.catalog_categories c set sort_order = t.position - 1
    from unnest(ordered) with ordinality as t(slug, position) where c.slug = t.slug;
  else
    update public.catalog_brands b set sort_order = t.position - 1
    from unnest(ordered) with ordinality as t(slug, position) where b.slug = t.slug;
  end if;
end;
$$;
revoke all on function public.reorder_catalog_metadata(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.reorder_catalog_metadata(text, text[], text[]) to authenticated;
