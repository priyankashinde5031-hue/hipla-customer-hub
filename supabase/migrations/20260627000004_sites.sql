-- Site = one office of an Organization. Almost all operational data hangs
-- off this table, not Organization. Spec §5.1.
create table sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  is_hq boolean not null default false,

  -- Three distinct addresses, since they differ per office (spec §5.1).
  address_site jsonb,
  address_billing jsonb,
  address_shipping jsonb,

  gst_number text,
  region text,
  timezone text,
  status text not null default 'prospect'
    check (status in ('prospect', 'implementing', 'live', 'suspended', 'churned')),
  onboarding_owner_id uuid references internal_users(id),
  cs_owner_id uuid references internal_users(id),
  go_live_date date, -- the renewal anchor (spec §5.4) once live

  created_at timestamptz not null default now()
);

create index sites_organization_idx on sites (organization_id);
