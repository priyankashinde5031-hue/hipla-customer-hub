-- User management + full staff visibility.
--
-- internal_users previously had only "read/update your own row" policies
-- (20260627000012). That means the owner dropdowns on Sites/POs and the new
-- Approver dropdown on device replacement couldn't actually list other staff.
-- These policies let admins/managers READ the whole staff list, and let admins
-- (only) CREATE and EDIT staff via the new Settings → Users tab.
--
-- is_admin_or_manager() is security definer and reads internal_users without
-- recursing through its own RLS, so these policies don't self-reference.

create policy internal_users_select_staff
  on internal_users
  for select
  to authenticated
  using (is_admin_or_manager());

-- Managing staff (and therefore roles) is admin-only. is_admin() mirrors the
-- existing helpers: security definer so it can read internal_users without
-- recursive RLS evaluation.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from internal_users
    where email = (auth.jwt() ->> 'email')
      and role = 'admin'
      and is_active = true
  );
$$;

create policy internal_users_insert_admin
  on internal_users
  for insert
  to authenticated
  with check (is_admin());

create policy internal_users_update_admin
  on internal_users
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());
