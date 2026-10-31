-- New objects in public stay out of the Data API until a migration grants
-- access explicitly. Supabase is making this the platform default; this
-- project was created with the older automatic grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- Functions are no longer executable by every role by default; grant execute
-- on each function to the roles that call it.
alter default privileges for role postgres
  revoke execute on functions from public;
