-- Read access for any active internal user, on Organizations and Sites
-- (the data the Org/Site list and 360 pages need). All roles can read for
-- v1 (spec §9: read_only gets "dashboard + 360, no edits"); write
-- restrictions come later when we build editing.
--
-- security definer + a fixed search_path: the function deliberately
-- bypasses internal_users' own RLS (it only ever checks the caller's own
-- email, matching the self-access policy already in place) so policies on
-- other tables can call it without recursive RLS evaluation.
create or replace function public.is_active_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from internal_users
    where email = (auth.jwt() ->> 'email')
    and is_active = true
  );
$$;

create policy organizations_select_internal
  on organizations
  for select
  to authenticated
  using (is_active_internal_user());

create policy sites_select_internal
  on sites
  for select
  to authenticated
  using (is_active_internal_user());
