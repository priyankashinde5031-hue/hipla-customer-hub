-- Settings catalogs: read access for any active internal user (already
-- implied by app-level gating, but RLS needs its own policy), and write
-- access (insert/update — no hard delete, per CLAUDE.md soft-delete rule)
-- restricted to admin/manager roles.
--
-- is_admin_or_manager() mirrors is_active_internal_user(): security definer
-- so it can read internal_users without recursive RLS evaluation.
create or replace function public.is_admin_or_manager()
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
    and role in ('admin', 'manager')
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'modules', 'entry_sources', 'hardware_catalog', 'cost_types',
    'po_types', 'ticket_topics', 'term_lengths'
  ]
  loop
    execute format(
      'create policy %I_select_internal on %I for select to authenticated using (is_active_internal_user());',
      t, t
    );
    execute format(
      'create policy %I_write_admin_manager on %I for insert to authenticated with check (is_admin_or_manager());',
      t, t
    );
    execute format(
      'create policy %I_update_admin_manager on %I for update to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());',
      t, t
    );
  end loop;
end $$;

-- entry_source_module_map: same pattern, keyed off entry_sources/modules
-- visibility (anyone active can read; only admin/manager can write).
create policy entry_source_module_map_select_internal
  on entry_source_module_map
  for select
  to authenticated
  using (is_active_internal_user());

create policy entry_source_module_map_write_admin_manager
  on entry_source_module_map
  for insert
  to authenticated
  with check (is_admin_or_manager());

create policy entry_source_module_map_delete_admin_manager
  on entry_source_module_map
  for delete
  to authenticated
  using (is_admin_or_manager());

-- Audit log: admin/manager can write entries (read is internal-only via the
-- app layer for now — no UI to browse audit_log yet, so no select policy
-- needed beyond what's already there).
create policy audit_log_insert_admin_manager
  on audit_log
  for insert
  to authenticated
  with check (is_admin_or_manager());
