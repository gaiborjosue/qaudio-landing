create table public.instagram_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  accounts jsonb not null check (jsonb_typeof(accounts) = 'array'),
  encrypted_access_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);
comment on table public.instagram_connections is 'Per-admin Instagram Unified Login connection. Tokens use application-side AES-256-GCM; plaintext is never stored.';
alter table public.instagram_connections enable row level security;
revoke all on public.instagram_connections from public, anon, authenticated;
grant select, insert, update, delete on public.instagram_connections to authenticated, service_role;
create policy instagram_connection_owner on public.instagram_connections
for all to authenticated
using (owner_id = (select auth.uid()) and (select private.is_admin()))
with check (owner_id = (select auth.uid()) and (select private.is_admin()));

create table public.instagram_oauth_states (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);
comment on table public.instagram_oauth_states is 'Short-lived OAuth attempts. Only a SHA-256 state hash is stored; callback consumes the matching row once.';
alter table public.instagram_oauth_states enable row level security;
revoke all on public.instagram_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.instagram_oauth_states to authenticated, service_role;
create policy instagram_oauth_state_owner on public.instagram_oauth_states
for all to authenticated
using (owner_id = (select auth.uid()) and (select private.is_admin()))
with check (owner_id = (select auth.uid()) and (select private.is_admin()));
