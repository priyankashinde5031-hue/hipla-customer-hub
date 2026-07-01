-- Turn three free-text Purchase Order fields into managed dropdowns, driven by
-- seeded catalog tables (CLAUDE.md: "reference data is data, not code"). This
-- mirrors the existing po_types / cost_types pattern so the same Settings UI
-- can manage them.
--
--   1. Financial year  — was a free-text column on purchase_orders.
--   2. Payment terms    — was a free-text column on purchase_orders.
--   3. Contract time    — brand-new field (no column existed before).
--
-- The old text columns (purchase_orders.financial_year / .payment_terms) are
-- LEFT IN PLACE on purpose — dropping a column is destructive and needs sign-off
-- (CLAUDE.md). We backfill the new id columns from them and the app reads the
-- new columns from here on.

-- 1. Catalog tables ----------------------------------------------------------
create table financial_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- e.g. 'FY2025-26'
  active boolean not null default true
);

create table payment_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- e.g. 'Net 30'
  active boolean not null default true
);

create table contract_times (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- e.g. '1 year'
  active boolean not null default true
);

-- 2. Seed starter options ----------------------------------------------------
-- Includes the values already used by seed data so the backfill below matches.
-- Priyanka can add / rename / deactivate these from Settings.
insert into financial_years (name) values
  ('FY2023-24'), ('FY2024-25'), ('FY2025-26'), ('FY2026-27'), ('FY2027-28')
on conflict (name) do nothing;

insert into payment_terms (name) values
  ('Advance'), ('On receipt'), ('Net 15'), ('Net 30'), ('Net 45'),
  ('Net 60'), ('Net 90')
on conflict (name) do nothing;

insert into contract_times (name) values
  ('1 year'), ('2 years'), ('3 years'), ('5 years')
on conflict (name) do nothing;

-- 3. New foreign-key columns on purchase_orders ------------------------------
alter table purchase_orders
  add column financial_year_id uuid references financial_years(id),
  add column payment_terms_id  uuid references payment_terms(id),
  add column contract_time_id  uuid references contract_times(id);

create index purchase_orders_financial_year_idx on purchase_orders (financial_year_id);
create index purchase_orders_payment_terms_idx  on purchase_orders (payment_terms_id);
create index purchase_orders_contract_time_idx  on purchase_orders (contract_time_id);

-- 4. Backfill the new columns from the old free-text values -------------------
update purchase_orders po
set financial_year_id = fy.id
from financial_years fy
where po.financial_year is not null
  and lower(trim(po.financial_year)) = lower(fy.name)
  and po.financial_year_id is null;

update purchase_orders po
set payment_terms_id = pt.id
from payment_terms pt
where po.payment_terms is not null
  and lower(trim(po.payment_terms)) = lower(pt.name)
  and po.payment_terms_id is null;

-- 5. RLS: read for any active internal user; write for admin/manager ---------
-- Mirrors the catalog policies in 20260627000014. Helper functions
-- is_active_internal_user() / is_admin_or_manager() already exist.
alter table financial_years enable row level security;
alter table payment_terms   enable row level security;
alter table contract_times  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['financial_years', 'payment_terms', 'contract_times']
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
