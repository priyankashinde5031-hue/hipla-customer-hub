-- Feature: "Hardware provided by?" on each device.
--
-- Adds a managed reference catalog of hardware-ownership types (CLAUDE.md:
-- "reference data is data, not code") and points each device at one via a
-- NULLABLE FK. Nullable is deliberate: every device that already exists keeps
-- its exact current row and simply reads as "unset" — no backfill, nothing
-- overwritten (CLAUDE.md: don't touch already-filled data).
--
-- Mirrors the spox_roles / internal_teams catalog pattern: name + auto-derived
-- slug so it can later be Settings-managed with only a name. One extra column,
-- `implies_customer_amc`, encodes the smart default used by the renewal-year
-- "Hardware AMC by customer?" toggle (see 20260809000002) — kept as DATA on the
-- catalog row, not hardcoded against option names in the app.

create table hardware_ownership_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  -- Smart-default hint for the per-year AMC toggle: true  → suggest "AMC by
  -- customer = Yes", false → suggest "No", null → no strong default (blank).
  implies_customer_amc boolean,
  created_at timestamptz not null default now()
);

-- Auto-derive slug from name (BEFORE trigger, runs before the NOT NULL check) —
-- same pattern as spox_roles/internal_teams.
create or replace function set_hardware_ownership_type_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'));
    if new.slug = '' then
      new.slug := 'ownership-' || substr(gen_random_uuid()::text, 1, 8);
    end if;
  end if;
  return new;
end;
$$;

create trigger hardware_ownership_types_set_slug
  before insert or update on hardware_ownership_types
  for each row execute function set_hardware_ownership_type_slug();

-- Seed the three built-in options with stable slugs and their AMC default.
--   customer-owned / Hipla one-time purchased by customer → customer bears AMC
--   Hipla opex (Hipla owns the hardware)                  → Hipla bears AMC
insert into hardware_ownership_types (name, slug, sort_order, implies_customer_amc) values
  ('Hipla (One-time purchased by customer)', 'hipla-one-time-customer', 1, true),
  ('Hipla (Opex — hardware owned by Hipla)', 'hipla-opex',              2, false),
  ('Customer',                               'customer',                3, true)
on conflict (slug) do nothing;

-- Point each device at the catalog. NULLABLE and no backfill — existing devices
-- stay untouched and simply have no ownership type set until someone edits them.
alter table devices add column ownership_type_id uuid references hardware_ownership_types(id);

create index devices_ownership_type_idx on devices (ownership_type_id);

-- RLS: read for any active internal user; writes admin/manager only — same as
-- the other catalogs.
alter table hardware_ownership_types enable row level security;

create policy hardware_ownership_types_select_internal on hardware_ownership_types
  for select to authenticated using (is_active_internal_user());
create policy hardware_ownership_types_write_admin_manager on hardware_ownership_types
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
