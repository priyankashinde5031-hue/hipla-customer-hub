-- Milestone 9 — Usage tracking (spec §5.10). Usage is per Site + Module +
-- Entry Source + period (year / month / week 1–5), with a derived usage-health
-- category comparing actual entries to an expected entries-per-week target.
--
-- v1 scope: manual entry only (CSV import is a later step). Expected target is
-- per Site + Module (per deployment), stored in usage_expectations.

create table usage_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  module_id uuid not null references modules(id),
  entry_source_id uuid not null references entry_sources(id),
  year integer not null,
  month integer not null check (month between 1 and 12),
  week integer not null check (week between 1 and 5),
  entry_count integer not null check (entry_count >= 0),
  notes text,
  source text not null default 'manual' check (source in ('imported', 'manual')),
  created_by uuid references internal_users(id),
  created_at timestamptz not null default now()
);

-- Index FKs + the period columns from the start (CLAUDE.md: keep Site 360 fast).
create index usage_entries_site_idx on usage_entries (site_id);
create index usage_entries_site_period_idx on usage_entries (site_id, year, month, week);
create index usage_entries_site_module_idx on usage_entries (site_id, module_id);

-- The expected entries-per-week target, per Site + Module. An absent row means
-- "no target set" — the app treats that as category = Unknown / neutral.
create table usage_expectations (
  site_id uuid not null references sites(id) on delete cascade,
  module_id uuid not null references modules(id),
  expected_per_week integer not null check (expected_per_week >= 0),
  updated_at timestamptz not null default now(),
  primary key (site_id, module_id)
);

-- RLS: read = any active internal user; write = admin/manager only.
-- Helpers is_active_internal_user() / is_admin_or_manager() already exist.
alter table usage_entries enable row level security;
alter table usage_expectations enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['usage_entries', 'usage_expectations']
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
    execute format(
      'create policy %I_delete_admin_manager on %I for delete to authenticated using (is_admin_or_manager());',
      t, t
    );
  end loop;
end $$;
