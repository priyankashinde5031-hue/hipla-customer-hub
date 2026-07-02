-- Hardware & Device Replacement (site-level feature).
--
-- A Device is one physical unit installed at a Site, identified by its Esper
-- ID. Devices are never edited in place when hardware fails: a replacement
-- event RETIRES the old device row and CREATES a brand-new device row for the
-- incoming unit, linked by a device_replacements record. This preserves full
-- history — every unit that ever sat in a "slot" at a Site stays queryable and
-- nothing is overwritten (CLAUDE.md: soft-delete and keep history over
-- destructive edits, especially for devices).
--
-- hardware_catalog already exists (see 20260627000005_catalogs.sql) with
-- (id, name, category, active). Devices reference it; the "Hardware Name"
-- dropdown reads active rows from it — never hardcoded (CLAUDE.md: reference
-- data is data, not code).

-- One row per physical unit, ever. Both originally-added devices and the "new"
-- side of a replacement live here.
create table devices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  hardware_catalog_id uuid not null references hardware_catalog(id),
  esper_id text not null,
  name_on_esper text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index FKs + the site scope from the start (CLAUDE.md: keep the Site 360 fast).
create index devices_site_active_idx on devices (site_id) where is_deleted = false;
create index devices_hardware_idx on devices (hardware_catalog_id);

-- One row per replacement event. old_device_id is retired the moment this row
-- exists; new_device_id becomes the active device in that slot.
create table device_replacements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  old_device_id uuid not null references devices(id),
  new_device_id uuid not null references devices(id),
  approved_by uuid not null references internal_users(id),
  replaced_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),

  -- A device can only ever be the "old" side once: replace-again always
  -- targets whatever device is currently active in the slot, a different row.
  constraint uq_old_device unique (old_device_id),
  -- Each replacement always creates a fresh device row, so a device can be the
  -- "new" side of at most one event.
  constraint uq_new_device unique (new_device_id),
  constraint chk_old_ne_new check (old_device_id <> new_device_id)
);

create index device_replacements_site_idx on device_replacements (site_id);

-- Derived status — never stored, so it can't drift (CLAUDE.md: computed, not
-- hand-maintained). A device is 'replaced' once it appears as an old_device_id,
-- otherwise 'active'; it's a replacement unit if it's some event's new_device_id.
-- security_invoker = on so the view respects the querying user's RLS.
create view device_status with (security_invoker = on) as
select
  d.*,
  case when dr_old.old_device_id is not null then 'replaced' else 'active' end as status,
  dr_new.new_device_id is not null as is_replacement_unit
from devices d
left join device_replacements dr_old on dr_old.old_device_id = d.id
left join device_replacements dr_new on dr_new.new_device_id = d.id
where d.is_deleted = false;

-- Replacing a device is ONE atomic transaction (spec rule 3): insert the new
-- device, then link old → new. A plpgsql function runs both in a single
-- implicit transaction — both succeed or neither does, never an orphaned
-- device or replacement. security invoker keeps RLS/authorization on the
-- caller (only admin/manager can insert, per the policies below).
create or replace function replace_device(
  p_site_id uuid,
  p_old_device_id uuid,
  p_hardware_catalog_id uuid,
  p_esper_id text,
  p_name_on_esper text,
  p_approved_by uuid,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_new_id uuid;
  v_old devices%rowtype;
  v_esper text := btrim(p_esper_id);
  v_name text := btrim(p_name_on_esper);
begin
  if v_esper = '' then raise exception 'ESPER_REQUIRED'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;

  -- Old device must exist, belong to this site, and not be soft-deleted.
  select * into v_old from devices where id = p_old_device_id for update;
  if not found then raise exception 'OLD_DEVICE_NOT_FOUND'; end if;
  if v_old.is_deleted then raise exception 'OLD_DEVICE_DELETED'; end if;
  if v_old.site_id <> p_site_id then raise exception 'CROSS_SITE'; end if;

  -- Old device must be currently active — not already the old side of a
  -- replacement (spec rule 1). The unique constraint also enforces this, but
  -- checking first gives a clean error instead of a raw constraint violation.
  if exists (select 1 from device_replacements where old_device_id = p_old_device_id) then
    raise exception 'ALREADY_REPLACED';
  end if;

  -- New Esper ID must be unique among currently active devices (spec rule 5).
  -- Historical/replaced/deleted devices keep their old Esper ID for audit, so
  -- only compare against non-deleted, non-replaced rows.
  if exists (
    select 1 from devices d
    where d.is_deleted = false
      and lower(d.esper_id) = lower(v_esper)
      and not exists (select 1 from device_replacements r where r.old_device_id = d.id)
  ) then
    raise exception 'ESPER_DUPLICATE';
  end if;

  insert into devices (site_id, hardware_catalog_id, esper_id, name_on_esper)
  values (p_site_id, p_hardware_catalog_id, v_esper, v_name)
  returning id into v_new_id;

  insert into device_replacements (site_id, old_device_id, new_device_id, approved_by, notes)
  values (p_site_id, p_old_device_id, v_new_id, p_approved_by, nullif(btrim(p_notes), ''));

  return v_new_id;
end;
$$;

grant execute on function replace_device(uuid, uuid, uuid, text, text, uuid, text) to authenticated;

-- RLS: read = any active internal user; write = admin/manager only. Helpers
-- is_active_internal_user() / is_admin_or_manager() already exist.
alter table devices enable row level security;
alter table device_replacements enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['devices', 'device_replacements']
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
  end loop;
end $$;
-- No delete policy: devices are soft-deleted (is_deleted = true via update),
-- and device_replacements is append-only history — never edited or deleted.
