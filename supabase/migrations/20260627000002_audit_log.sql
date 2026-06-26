-- Append-only history of important changes. Audited broadly (Organization,
-- Site, and all commercial/scope/device/approval mutations) per Priyanka's
-- 2026-06-27 decision to audit broadly, not just commercials.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references internal_users(id),
  action text not null, -- e.g. 'create', 'update', 'delete', 'soft_delete'
  entity_type text not null, -- e.g. 'organization', 'site', 'purchase_order'
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_idx on audit_log (actor_id);

comment on table audit_log is 'Append-only. Never update or delete rows here.';
