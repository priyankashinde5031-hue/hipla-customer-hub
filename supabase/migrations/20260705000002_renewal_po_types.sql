-- Renewal PO Type as managed reference data (CLAUDE.md: "reference data is data,
-- not code"). Classifies the PO raised for a renewal year — recorded per renewal
-- on the Site 360 renewal card, alongside the renewal PO attachment.

create table renewal_po_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A small realistic starter set — the rest is added from Settings.
insert into renewal_po_types (name) values
  ('New PO'), ('Renewal PO'), ('Amendment PO')
on conflict (name) do nothing;

-- Point each renewal at its type (nullable — recorded when the renewal PO lands).
alter table renewals
  add column renewal_po_type_id uuid references renewal_po_types(id);

create index renewals_renewal_po_type_idx on renewals (renewal_po_type_id);

-- RLS: read for any active internal user; writes admin/manager only — same rule
-- the generic catalog editor and the rest of the commercial flow enforce.
alter table renewal_po_types enable row level security;

create policy renewal_po_types_select_internal on renewal_po_types
  for select to authenticated using (is_active_internal_user());
create policy renewal_po_types_write_admin_manager on renewal_po_types
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
