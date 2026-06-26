-- Organization = the company / HQ. Spec §5.1.
create table organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  brand_name text,
  industry text,
  logo_url text,
  primary_domain text,
  notes text,
  owner_id uuid references internal_users(id), -- internal account manager
  status text not null default 'prospect' check (status in ('prospect', 'active', 'churned')),
  created_at timestamptz not null default now()
);
