-- Renewals (Year 2–5 projections). Spec §5.4: a Renewal is a forward-looking
-- event generated from go-live + the rolling contract terms, carrying its own
-- term so multi-year cycles work. The prototype's "Year 2–5 projections w/
-- deviation" becomes a series of these rows.
--
-- Design decisions for this v1 (see CLAUDE.md "when unsure"):
--   * Renewals hang off the PurchaseOrder, not a Contract. The PO is the object
--     the app actually creates today (the PO form does not create a Contract),
--     and the brief asks for renewals "linked to the parent customer/PO". A
--     nullable contract_id is kept for when Contracts get wired in. // DECISION: spec §5.4
--   * Renewal dates are NOT stored. They are computed on read from the anchor
--     site's go_live_date + offset_months, so setting/clearing the Go Live Date
--     in Implementation (sites.go_live_date) updates them automatically.
--   * Expected value is a SNAPSHOT of the Year-1 PO value taken at generation,
--     and is editable per row (the "Commercial Table" is not built yet, so the
--     Year-1 PO value is the projection baseline). // DECISION: confirmed with owner

create table renewals (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id),
  organization_id uuid not null references organizations(id),
  contract_id uuid references contracts(id),          -- future use; null for now
  anchor_site_id uuid references sites(id),            -- whose go_live_date drives the dates

  year_number integer not null check (year_number > 1),  -- contract year this cycle begins (2,3,4,5…)
  offset_months integer not null check (offset_months > 0), -- months from go-live to this renewal
  term_months integer not null default 12 check (term_months > 0), -- this cycle's length

  expected_value_paise bigint check (expected_value_paise >= 0), -- snapshot of Year-1 PO value, editable
  renewal_value_paise bigint check (renewal_value_paise >= 0),   -- actual, entered
  renewal_received_date date,
  payment_terms text,
  attachment_id uuid references attachments(id),

  status text not null default 'upcoming'
    check (status in ('upcoming', 'renewed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (po_id, year_number)   -- never double-generate a year for a PO
);

create index renewals_po_idx on renewals (po_id);
create index renewals_organization_idx on renewals (organization_id);
create index renewals_anchor_site_idx on renewals (anchor_site_id);

-- Deviation % (actual vs expected) is computed on read, never stored — it is a
-- derived figure (CLAUDE.md: money is computed, never hand-totaled).

-- RLS: read for any active internal user; write for admin/manager. Mirrors the
-- PO policies (20260629000001). Helper functions already exist.
alter table renewals enable row level security;

create policy renewals_select_internal on renewals
  for select to authenticated using (is_active_internal_user());
create policy renewals_insert_admin_manager on renewals
  for insert to authenticated with check (is_admin_or_manager());
create policy renewals_update_admin_manager on renewals
  for update to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());

-- ---------------------------------------------------------------------------
-- Storage: first bucket in the app. PO files attached to a specific renewal
-- year live here; the path is recorded in the attachments table (never the
-- bytes in the DB — CLAUDE.md). Private bucket; served via signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('renewal-attachments', 'renewal-attachments', false)
on conflict (id) do nothing;

-- Read: any active internal user. Write: admin/manager (same as commercial edits).
create policy "renewal_attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'renewal-attachments' and is_active_internal_user());

create policy "renewal_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'renewal-attachments' and is_admin_or_manager());

-- attachments table had RLS enabled in an earlier migration but the renewal
-- flow needs admin/manager to record file metadata rows. Add policies if the
-- table is reachable; safe-guarded so re-runs don't error.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attachments'
      and policyname = 'attachments_select_internal'
  ) then
    null; -- already set up
  else
    execute 'create policy attachments_select_internal on attachments for select to authenticated using (is_active_internal_user())';
    execute 'create policy attachments_insert_admin_manager on attachments for insert to authenticated with check (is_admin_or_manager())';
  end if;
end $$;
