-- The owner created this confirmed account in Supabase Authentication.
-- Resolve its Auth ID by email; environments without the account are unchanged.
insert into private.admins (user_id)
select id
from auth.users
where lower(email) = 'qaudioma@gmail.com'
  and email_confirmed_at is not null
  and not coalesce(banned_until > now(), false)
on conflict (user_id) do nothing;
