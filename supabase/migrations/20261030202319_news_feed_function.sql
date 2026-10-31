-- One page of the public news feed, newest first, for keyset pagination:
-- pass the last card's published_at and id to get the posts after it. It
-- runs as the caller (RLS applies) and returns card fields only, not bodies.
create function public.news_feed(
  after_published_at timestamptz default null,
  after_id uuid default null,
  max_rows integer default 3
)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  cover_path text,
  cover_width integer,
  cover_height integer,
  cover_alt text,
  cover_fit text,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.slug,
    p.title,
    p.excerpt,
    p.cover_path,
    p.cover_width,
    p.cover_height,
    p.cover_alt,
    p.cover_fit,
    p.published_at
  from public.news_posts as p
  where p.status = 'published'
    and p.published_at <= now()
    and (
      after_published_at is null
      or (p.published_at, p.id) < (after_published_at, after_id)
    )
  order by p.published_at desc, p.id desc
  limit least(greatest(coalesce(max_rows, 3), 1), 50);
$$;

comment on function public.news_feed(timestamptz, uuid, integer) is 'Published news cards after a (published_at, id) cursor, newest first.';

revoke all on function public.news_feed(timestamptz, uuid, integer) from public;
grant execute on function public.news_feed(timestamptz, uuid, integer) to anon, authenticated, service_role;
