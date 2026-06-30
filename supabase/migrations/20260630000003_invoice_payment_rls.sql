-- Invoices & Payments had row-level security ENABLED (20260627000011) but no
-- policies, so they were unreachable via the app's authenticated key — the
-- Site 360 invoice section showed nothing, and invoices couldn't be created.
-- Add the same pattern used for the PO tables (20260629000001):
--   read   = any active internal user
--   write  = admin / manager only
-- Helpers is_active_internal_user() / is_admin_or_manager() already exist.
do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'payments']
  loop
    execute format(
      'create policy %I_select_internal on %I for select to authenticated using (is_active_internal_user());',
      t, t
    );
    execute format(
      'create policy %I_insert_admin_manager on %I for insert to authenticated with check (is_admin_or_manager());',
      t, t
    );
    execute format(
      'create policy %I_update_admin_manager on %I for update to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());',
      t, t
    );
  end loop;
end $$;
