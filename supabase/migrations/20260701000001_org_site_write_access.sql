-- Organizations and Sites currently only have SELECT policies (spec §9:
-- everyone active can read). Add insert/update, restricted to admin/manager,
-- so the new "Add Organization" / "Add Site" flows can actually write.
-- Mirrors the pattern in 20260627000014_catalog_write_access.sql.

create policy organizations_insert_admin_manager
  on organizations
  for insert
  to authenticated
  with check (is_admin_or_manager());

create policy organizations_update_admin_manager
  on organizations
  for update
  to authenticated
  using (is_admin_or_manager())
  with check (is_admin_or_manager());

create policy sites_insert_admin_manager
  on sites
  for insert
  to authenticated
  with check (is_admin_or_manager());

create policy sites_update_admin_manager
  on sites
  for update
  to authenticated
  using (is_admin_or_manager())
  with check (is_admin_or_manager());
