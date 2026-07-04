-- Spox roles as managed reference data (CLAUDE.md: "reference data is data, not
-- code"). Previously the role was a hardcoded CHECK enum on spox.role
-- (decision_maker → end_user), duplicated in the UI. This turns it into a
-- Settings-managed catalog and points each Spox at a role by FK — exactly how a
-- Spox already references its internal owner team (internal_owner_team_id).
--
-- Mirrors internal_teams: name + auto-derived slug so the generic Settings
-- catalog editor can manage it with only a name.

create table spox_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Auto-derive slug from name (a BEFORE trigger runs before the NOT NULL check),
-- same pattern as internal_teams — adding a role from Settings needs only a
-- name. Existing/seeded rows keep their slugs; the trigger only fills a blank.
create or replace function set_spox_role_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'));
    if new.slug = '' then
      new.slug := 'role-' || substr(gen_random_uuid()::text, 1, 8);
    end if;
  end if;
  return new;
end;
$$;

create trigger spox_roles_set_slug
  before insert or update on spox_roles
  for each row execute function set_spox_role_slug();

-- Seed the four built-in roles with their existing slugs (so the backfill below
-- can match the old spox.role values) and their display order.
insert into spox_roles (name, slug, sort_order) values
  ('Decision Maker', 'decision_maker', 1),
  ('Solution Approver', 'solution_approver', 2),
  ('Middle User/Manager', 'middle_user_manager', 3),
  ('End User', 'end_user', 4)
on conflict (slug) do nothing;

-- Point each Spox at the catalog. Nullable during the backfill, then NOT NULL.
alter table spox add column spox_role_id uuid references spox_roles(id);

update spox s
  set spox_role_id = r.id
  from spox_roles r
  where r.slug = s.role;

alter table spox alter column spox_role_id set not null;

-- Retire the hardcoded text enum. The CHECK constraint drops with the column;
-- historical role values remain preserved in audit_log before/after JSON.
drop index if exists spox_role_idx;
alter table spox drop column role;

create index spox_role_id_idx on spox (spox_role_id);

-- RLS: same as internal_teams — read for any active internal user; writes
-- admin/manager only (the generic catalog editor enforces the same rule).
alter table spox_roles enable row level security;

create policy spox_roles_select_internal on spox_roles
  for select to authenticated using (is_active_internal_user());
create policy spox_roles_write_admin_manager on spox_roles
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
