-- Store hours for the home page (visit section and hero pill): the regular
-- week and dated changes such as holidays or closures. Moves the values that
-- were in lib/store-hours.ts. Dates and times are store-local
-- (America/New_York).

-- The regular week: exactly one row per weekday (Monday = 0). Rows are edited,
-- never added or removed.
create table public.store_weekly_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  kind text not null check (kind in ('open', 'appointment', 'closed')),
  opens_at time,
  closes_at time,
  updated_at timestamptz not null default now(),
  constraint store_weekly_hours_times check (
    (kind = 'open' and opens_at is not null and closes_at is not null and opens_at < closes_at)
    or (kind <> 'open' and opens_at is null and closes_at is null)
  )
);

comment on table public.store_weekly_hours is 'Regular store hours, one row per weekday (Monday = 0), in store time.';
comment on column public.store_weekly_hours.kind is 'open (with opens_at/closes_at), appointment, or closed.';

-- Special hours and closures. Each overrides the regular week for its dates
-- and shows as a schedule-change notice until it ends.
create table public.store_hours_changes (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  kind text not null check (kind in ('open', 'appointment', 'closed')),
  opens_at time,
  closes_at time,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_hours_changes_dates check (ends_on >= starts_on),
  constraint store_hours_changes_times check (
    (kind = 'open' and opens_at is not null and closes_at is not null and opens_at < closes_at)
    or (kind <> 'open' and opens_at is null and closes_at is null)
  )
);

comment on table public.store_hours_changes is 'Dated hour changes and closures (store-local dates, ends_on inclusive); overrides the regular week.';
comment on column public.store_hours_changes.ends_on is 'Last affected date, inclusive; equal to starts_on for a single day.';
comment on column public.store_hours_changes.note is 'Optional short reason shown with the change, such as "Thanksgiving".';

-- Serves the "changes that haven't ended yet" read.
create index store_hours_changes_ends_on_idx on public.store_hours_changes (ends_on);

create trigger store_weekly_hours_set_updated_at
  before update on public.store_weekly_hours
  for each row execute function private.set_updated_at();

create trigger store_hours_changes_set_updated_at
  before update on public.store_hours_changes
  for each row execute function private.set_updated_at();

alter table public.store_weekly_hours enable row level security;
alter table public.store_hours_changes enable row level security;

-- The week has fixed rows: only reads and edits, no inserts or deletes.
grant select on table public.store_weekly_hours to anon;
grant select, update on table public.store_weekly_hours to authenticated, service_role;
grant select on table public.store_hours_changes to anon;
grant select, insert, update, delete on table public.store_hours_changes to authenticated, service_role;

create policy "Anyone can read store hours"
on public.store_weekly_hours for select
to anon, authenticated
using (true);

create policy "Admins can edit store hours"
on public.store_weekly_hours for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Anyone can read hour changes"
on public.store_hours_changes for select
to anon, authenticated
using (true);

create policy "Admins can add hour changes"
on public.store_hours_changes for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admins can edit hour changes"
on public.store_hours_changes for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete hour changes"
on public.store_hours_changes for delete
to authenticated
using ((select private.is_admin()));

-- Current hours, moved from lib/store-hours.ts.
insert into public.store_weekly_hours (weekday, kind, opens_at, closes_at) values
  (0, 'appointment', null, null),
  (1, 'open', '13:00', '19:00'),
  (2, 'open', '13:00', '19:00'),
  (3, 'open', '13:00', '19:00'),
  (4, 'open', '13:00', '19:00'),
  (5, 'open', '09:00', '13:00'),
  (6, 'appointment', null, null);

insert into public.store_hours_changes (starts_on, ends_on, kind, opens_at, closes_at) values
  ('2026-11-06', '2026-11-06', 'open', '13:00', '15:00'),
  ('2026-11-07', '2026-11-15', 'closed', null, null);
