-- Allow admin/manager to DELETE renewals.
--
-- The renewals table (20260630000005) shipped with select/insert/update RLS
-- policies but NO delete policy. Under Postgres RLS a missing policy means the
-- action is denied — silently, since Supabase returns success with 0 rows
-- affected and no error. That broke the renewal ⇄ PO sync: when a PO edit drops
-- a year's expected value to ₹0, the sync tries to remove that pristine
-- "upcoming" renewal, but the delete was quietly refused and the empty card
-- lingered.
--
-- Mirror the insert/update rule (admin or manager). Renewals that are already
-- renewed / invoiced / attached are protected in application code (planRenewalSync),
-- so this policy only ever removes pristine projections.
create policy renewals_delete_admin_manager on renewals
  for delete to authenticated using (is_admin_or_manager());
