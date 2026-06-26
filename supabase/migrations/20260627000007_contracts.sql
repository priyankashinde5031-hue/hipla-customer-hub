-- Contract = the thing that renews. Owned by an Organization, covers one or
-- more Sites. Spec §5.4.
create table contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contract_number text not null unique,
  go_live_anchor_date date, -- renewal math anchors here, not signing date
  initial_term_id uuid references term_lengths(id),
  acv_paise bigint check (acv_paise >= 0), -- annual contract value, ex-tax
  billing_frequency text,
  payment_terms text,
  status text not null default 'active'
    check (status in ('active', 'expiring', 'renewed', 'churned')),
  created_at timestamptz not null default now()
);

create index contracts_organization_idx on contracts (organization_id);

create table contract_sites (
  contract_id uuid not null references contracts(id),
  site_id uuid not null references sites(id),
  primary key (contract_id, site_id)
);

create table contract_modules (
  contract_id uuid not null references contracts(id),
  module_id uuid not null references modules(id),
  primary key (contract_id, module_id)
);
