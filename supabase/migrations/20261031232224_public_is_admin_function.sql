-- Lets a signed-in user ask, through the Data API, whether they're a site
-- admin. The admin sign-in and the admin agent's route check call it;
-- private.is_admin() itself isn't reachable there. RLS policies keep using
-- private.is_admin().
create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

comment on function public.is_admin() is 'Whether the signed-in user is a site admin (private.admins). Used by the admin sign-in and the admin agent.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
