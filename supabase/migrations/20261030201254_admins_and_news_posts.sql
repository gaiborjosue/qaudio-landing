-- Admin membership and news posts.

-- Internal schema: not exposed through the Data API.
create schema if not exists private;
grant usage on schema private to authenticated;

-- Site admins. Add or remove a row to grant or revoke admin rights; the
-- change applies on the next request, unlike JWT claims.
create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table private.admins is 'Users who can create and edit site content.';

alter table private.admins enable row level security;
grant select on table private.admins to authenticated;

create policy "Users can see their own admin membership"
on private.admins for select
to authenticated
using (user_id = (select auth.uid()));

create function private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from private.admins where user_id = (select auth.uid())
  );
$$;

comment on function private.is_admin() is 'Whether the signed-in user is a site admin. Used by RLS policies.';

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- News posts (the /news feed and /news/<slug> article pages).
create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  cover_path text check (cover_path is null or char_length(cover_path) <= 300),
  cover_width integer check (cover_width > 0),
  cover_height integer check (cover_height > 0),
  cover_alt text not null default '' check (char_length(cover_alt) <= 500),
  cover_fit text not null default 'cover' check (cover_fit in ('cover', 'contain')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_posts_cover_complete check (
    (cover_path is null) = (cover_width is null)
    and (cover_path is null) = (cover_height is null)
  ),
  constraint news_posts_published_complete check (
    status <> 'published' or (published_at is not null and cover_path is not null)
  )
);

comment on table public.news_posts is 'News posts for /news, newest first by published_at.';
comment on column public.news_posts.slug is 'URL segment: /news/<slug>. Keeps the live qaudio.com permalinks.';
comment on column public.news_posts.excerpt is 'Plain-text card preview, written by the app when a post is saved.';
comment on column public.news_posts.body is 'Article blocks (paragraph, heading, list, quote, image); see NewsBlock in lib/news.ts.';
comment on column public.news_posts.cover_path is 'Object path in the media storage bucket.';
comment on column public.news_posts.cover_fit is 'contain letterboxes posters and wide product shots on the feed cards.';
comment on column public.news_posts.published_at is 'Publication time; a future time keeps a published post hidden until then.';

-- Feed order and keyset pagination: newest first, id breaks ties.
create index news_posts_feed_idx
  on public.news_posts (published_at desc, id desc)
  where status = 'published';

create trigger news_posts_set_updated_at
  before update on public.news_posts
  for each row execute function private.set_updated_at();

alter table public.news_posts enable row level security;

grant select on table public.news_posts to anon;
grant select, insert, update, delete on table public.news_posts to authenticated;
grant select, insert, update, delete on table public.news_posts to service_role;

create policy "Anyone can read published news"
on public.news_posts for select
to anon
using (status = 'published' and published_at <= now());

create policy "Signed-in users read published news; admins read all"
on public.news_posts for select
to authenticated
using (
  (status = 'published' and published_at <= now())
  or (select private.is_admin())
);

create policy "Admins can add news"
on public.news_posts for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admins can edit news"
on public.news_posts for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete news"
on public.news_posts for delete
to authenticated
using ((select private.is_admin()));
