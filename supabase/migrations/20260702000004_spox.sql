-- Spox (Single Point of Contact) — site-level feature.
--
-- A Spox is a person at the customer that Hipla is in contact with. It carries
-- two axes: their role/hierarchy at the customer (decision_maker → end_user)
-- and the internal Hipla owner of the relationship (which team, optionally
-- which staff member).
--
-- Continuity is the whole point: when a Spox leaves we NEVER hard-delete them.
-- We deactivate (status='inactive') and record who replaced them
-- (replaced_by_id), so old email/phone stay queryable for support-ticket
-- lookups (CLAUDE.md: soft-delete and keep history over destructive edits). A
-- separate hard delete exists only for genuine data-entry mistakes.

-- Which Hipla team owns a Spox relationship. Reference data, not code — the
-- "Internal owner team" dropdown reads active rows from here (CLAUDE.md:
-- reference data is data, not code).
create table internal_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Seed the standard teams. Idempotent so re-running the migration/seed is safe
-- (CLAUDE.md: keep the seed script idempotent).
insert into internal_teams (name, slug, sort_order) values
  ('Sales', 'sales', 1),
  ('Support', 'support', 2),
  ('Onboarding', 'onboarding', 3),
  ('Delivery/Project', 'delivery', 4),
  ('Leadership', 'leadership', 5),
  ('Other', 'other', 6)
on conflict (slug) do nothing;

-- One row per contact person, ever. Deactivated (former) contacts stay here.
create table spox (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  name text not null,
  role text not null check (
    role in ('decision_maker', 'solution_approver', 'middle_user_manager', 'end_user')
  ),
  email text,
  phone text,
  designation text,
  has_taken_training boolean not null default false,
  -- Required: every Spox has an internal owning team.
  internal_owner_team_id uuid not null references internal_teams(id),
  -- Optional: a specific Hipla staff member (reuses the internal_users list,
  -- same as PO owner / device approver).
  internal_owner_user_id uuid references internal_users(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  -- Set when this Spox is deactivated and replaced. Self-FK; if the replacement
  -- row is later hard-deleted (data-entry mistake), null this out rather than
  -- block the delete (spec §6.3).
  replaced_by_id uuid references spox(id) on delete set null,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A Spox can't be its own replacement.
  constraint chk_spox_replaced_ne_self check (replaced_by_id is null or replaced_by_id <> id)
);

-- Index FKs + the site+active scope from the start (CLAUDE.md: keep the Site
-- 360 fast). Active-contact lists and the card count both filter on status.
create index spox_site_active_idx on spox (site_id) where status = 'active';
create index spox_role_idx on spox (role);
create index spox_owner_team_idx on spox (internal_owner_team_id);

-- Deactivate a Spox and link its replacement in ONE statement (spec §5). The
-- replacement must already exist and be active at the same site — the "create a
-- brand-new replacement first" case is handled in the server action, which
-- inserts the new active Spox and then calls this with its id. security invoker
-- keeps RLS/authorization on the caller (admin/manager per the policies below).
create or replace function deactivate_spox(
  p_spox_id uuid,
  p_replacement_id uuid
) returns void
language plpgsql
security invoker
as $$
declare
  v_old spox%rowtype;
  v_new spox%rowtype;
begin
  if p_replacement_id is null then
    raise exception 'REPLACEMENT_REQUIRED';
  end if;
  if p_replacement_id = p_spox_id then
    raise exception 'REPLACEMENT_IS_SELF';
  end if;

  select * into v_old from spox where id = p_spox_id for update;
  if not found then raise exception 'SPOX_NOT_FOUND'; end if;
  if v_old.status <> 'active' then raise exception 'ALREADY_INACTIVE'; end if;

  select * into v_new from spox where id = p_replacement_id;
  if not found then raise exception 'REPLACEMENT_NOT_FOUND'; end if;
  if v_new.status <> 'active' then raise exception 'REPLACEMENT_INACTIVE'; end if;
  if v_new.site_id <> v_old.site_id then raise exception 'REPLACEMENT_CROSS_SITE'; end if;

  update spox
    set status = 'inactive',
        left_at = now(),
        replaced_by_id = p_replacement_id,
        updated_at = now()
    where id = p_spox_id;
end;
$$;

grant execute on function deactivate_spox(uuid, uuid) to authenticated;

-- RLS: read = any active internal user; insert/update = admin/manager only.
-- Unlike devices, Spox has a real hard-delete path (spec §6.3, data-entry
-- mistakes) so a delete policy is included, also admin/manager only. Helpers
-- is_active_internal_user() / is_admin_or_manager() already exist.
alter table internal_teams enable row level security;
alter table spox enable row level security;

-- Teams: readable by any active internal user; no management UI this milestone,
-- so writes are admin/manager only (seed is the source for now).
create policy internal_teams_select_internal on internal_teams
  for select to authenticated using (is_active_internal_user());
create policy internal_teams_write_admin_manager on internal_teams
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());

create policy spox_select_internal on spox
  for select to authenticated using (is_active_internal_user());
create policy spox_insert_admin_manager on spox
  for insert to authenticated with check (is_admin_or_manager());
create policy spox_update_admin_manager on spox
  for update to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
create policy spox_delete_admin_manager on spox
  for delete to authenticated using (is_admin_or_manager());
