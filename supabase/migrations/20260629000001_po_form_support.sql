-- Slice 3 (Commercials core): make Purchase Orders creatable/editable from the
-- app. Three things:
--   1. A human-friendly "PO Name" column (the schema only had the system
--      reference po_number + the customer's own ref).
--   2. Auto-generate the system reference (HIPLA-PO-XXXX) on insert via a
--      sequence-backed default, so the app never hand-assigns it.
--   3. RLS policies for the PO tables. They had row-level security ENABLED but
--      no policies, so nothing was reachable via the app (anon/authenticated
--      key). Read = any active internal user; write = admin/manager only,
--      mirroring the catalog pattern (see 20260627000014). This also makes the
--      Slice 2 read-only Site 360 view actually return rows.

-- 1. PO Name -----------------------------------------------------------------
alter table purchase_orders add column name text;

-- 2. System-generated reference HIPLA-PO-0001, 0002, ... ----------------------
create sequence if not exists po_number_seq;

-- Start the sequence past any existing numeric suffixes so we never collide
-- with seed data. Safe even if there are none.
select setval(
  'po_number_seq',
  greatest(
    1,
    coalesce(
      (select max((regexp_replace(po_number, '\D', '', 'g'))::bigint)
       from purchase_orders
       where po_number ~ '\d'),
      0
    ) + 1
  ),
  false
);

alter table purchase_orders
  alter column po_number set default
    'HIPLA-PO-' || lpad(nextval('po_number_seq')::text, 4, '0');

-- 3. RLS policies ------------------------------------------------------------
-- Helper functions is_active_internal_user() and is_admin_or_manager() already
-- exist (20260627000013 / 20260627000014).
do $$
declare
  t text;
begin
  foreach t in array array[
    'purchase_orders', 'po_sites', 'po_modules', 'po_line_items'
  ]
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
    -- Editing a PO replaces its covered-sites / modules / line-item rows, so
    -- admin/manager need delete on the child tables too. purchase_orders
    -- itself is soft-deleted only (no delete policy here, per CLAUDE.md).
    if t <> 'purchase_orders' then
      execute format(
        'create policy %I_delete_admin_manager on %I for delete to authenticated using (is_admin_or_manager());',
        t, t
      );
    end if;
  end loop;
end $$;
