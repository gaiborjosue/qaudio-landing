alter table public.news_posts
  add column expires_at timestamptz,
  add column has_linked_sales boolean not null default false,
  add constraint news_posts_expiry_after_publication check (
    expires_at is null or status <> 'published' or published_at < expires_at
  );

-- The link belongs to the current sale on a product. Replacing that sale
-- independently removes the link, so deleting a post can't cancel a later sale.
alter table public.products
  add column sale_news_post_id uuid references public.news_posts (id) on delete set null,
  add constraint products_linked_sale check (
    sale_news_post_id is null or (sale_price_cents is not null and sale_ends_at is not null)
  );

create index products_sale_news_post_idx
  on public.products (sale_news_post_id) where sale_news_post_id is not null;

create or replace function private.set_sold_equipment_draft()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.availability = 'sold'
    and (new.category_slug = 'used-equipment' or new.condition = 'Used') then
    new.status := 'draft';
  end if;
  return new;
end;
$$;

revoke all on function private.set_sold_equipment_draft() from public, anon, authenticated, service_role;

create trigger products_set_sold_equipment_draft
  before insert or update of availability, category_slug, condition, status on public.products
  for each row execute function private.set_sold_equipment_draft();

update public.products
set status = 'draft'
where status = 'published'
  and availability = 'sold'
  and (category_slug = 'used-equipment' or condition = 'Used');

alter table public.products add constraint products_sold_equipment_is_draft check (
  availability <> 'sold'
  or (category_slug <> 'used-equipment' and condition <> 'Used')
  or status = 'draft'
);

alter policy "Anyone can read published news" on public.news_posts
using (
  status = 'published' and published_at <= now()
  and (expires_at is null or expires_at > now())
  and (
    not has_linked_sales or exists (
      select 1 from public.products as product
      where product.sale_news_post_id = news_posts.id
        and product.status = 'published'
        and product.sale_ends_at > now()
    )
  )
);

alter policy "Signed-in users read published news; admins read all" on public.news_posts
using (
  (
    status = 'published' and published_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      not has_linked_sales or exists (
        select 1 from public.products as product
        where product.sale_news_post_id = news_posts.id
          and product.status = 'published'
          and product.sale_ends_at > now()
      )
    )
  )
  or (select private.is_admin())
);

-- The batch, its link, and the stale-price checks all share one transaction.
create function public.save_product_sales(
  p_products jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_news_post_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  post public.news_posts%rowtype;
  changed integer;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege;
  end if;

  if p_ends_at is null or p_ends_at <= now() or p_starts_at >= p_ends_at
    or coalesce(jsonb_array_length(p_products), 0) not between 1 and 50 then
    raise check_violation using message = 'The sale needs a valid window and 1 to 50 products.';
  end if;

  if p_news_post_id is not null then
    select * into post from public.news_posts where id = p_news_post_id for update;
    if not found or post.expires_at is null then
      raise check_violation using message = 'Read the saved sale news post again before linking prices.';
    end if;
    if post.status = 'published' and (
      (p_starts_at is null and post.published_at > now())
      or (p_starts_at is not null and p_starts_at <> date_trunc('minute', post.published_at))
    ) then
      raise check_violation using message = 'Use the approved news publication time as the sale start.';
    end if;
  end if;

  perform product.id from public.products as product
  join jsonb_to_recordset(p_products) as proposed(id uuid) on proposed.id = product.id
  order by product.id for update of product;

  update public.products as product
  set sale_price_cents = proposed.sale_price_cents,
      sale_starts_at = p_starts_at,
      sale_ends_at = p_ends_at,
      sale_news_post_id = p_news_post_id
  from jsonb_to_recordset(p_products) as proposed(
    id uuid, price_cents integer, msrp_cents integer, sale_price_cents integer
  )
  where product.id = proposed.id
    and product.price_cents = proposed.price_cents
    and product.msrp_cents is not distinct from proposed.msrp_cents
    and proposed.sale_price_cents > 0
    and proposed.sale_price_cents < product.price_cents;
  get diagnostics changed = row_count;

  if changed <> jsonb_array_length(p_products) then
    raise serialization_failure using message = 'Products or prices changed. Read the catalog and propose the sale again.';
  end if;

  if p_news_post_id is not null and not post.has_linked_sales then
    update public.news_posts set has_linked_sales = true where id = p_news_post_id;
  end if;
end;
$$;

revoke all on function public.save_product_sales(jsonb, timestamptz, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_product_sales(jsonb, timestamptz, timestamptz, uuid)
  to authenticated;

create function public.delete_news_with_sales(
  p_post_id uuid,
  p_sale_choice text default null
)
returns table (slug text, cancelled integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_slug text;
  cancelled_sales integer := 0;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege;
  end if;
  if p_sale_choice is not null and p_sale_choice not in ('keep', 'cancel') then
    raise check_violation using message = 'Choose whether to keep or cancel the scheduled prices.';
  end if;

  select post.slug into deleted_slug from public.news_posts as post
  where post.id = p_post_id for update;
  if not found then
    return;
  end if;

  perform product.id from public.products as product
  where product.sale_news_post_id = p_post_id order by product.id for update;

  if p_sale_choice is null and exists (
    select 1 from public.products where sale_news_post_id = p_post_id and sale_starts_at > now()
  ) then
    raise exception 'Choose whether to keep or cancel the scheduled prices.';
  end if;

  if p_sale_choice = 'cancel' then
    update public.products
    set sale_price_cents = null, sale_starts_at = null, sale_ends_at = null, sale_news_post_id = null
    where sale_news_post_id = p_post_id and sale_starts_at > now();
    get diagnostics cancelled_sales = row_count;
  end if;

  delete from public.news_posts where id = p_post_id;
  return query select deleted_slug, cancelled_sales;
end;
$$;

revoke all on function public.delete_news_with_sales(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_news_with_sales(uuid, text) to authenticated;
