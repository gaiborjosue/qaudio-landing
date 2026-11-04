-- Zernio owns social OAuth and tokens; the app no longer stores Meta grants.
-- Keep the original migration as history, and remove its unused storage here.
drop table public.instagram_oauth_states;
drop table public.instagram_connections;
