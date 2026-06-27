-- Lets a logged-in user read and link their own internal_users row by
-- matching the email on their Supabase Auth JWT. Needed so the login
-- callback (app/auth/callback/route.ts) can check role/active status and
-- link auth_user_id on first sign-in. Does not expose other staff rows.
create policy internal_users_select_own
  on internal_users
  for select
  to authenticated
  using (email = (auth.jwt() ->> 'email'));

create policy internal_users_update_own
  on internal_users
  for update
  to authenticated
  using (email = (auth.jwt() ->> 'email'))
  with check (email = (auth.jwt() ->> 'email'));
