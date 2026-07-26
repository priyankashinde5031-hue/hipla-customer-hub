-- Let the user record WHEN a device was replaced.
--
-- device_replacements.replaced_at already exists (20260702000002) but defaulted
-- to now() and was never settable — the replace_device() RPC took no date. The
-- "Replace device" dialog now offers a replacement date (defaulting to today,
-- editable), so the RPC gains an optional p_replaced_at. When null it still
-- falls back to now(), preserving the old behaviour.
--
-- Adding a parameter changes the function signature, so drop the old one first
-- (create-or-replace can't change the argument list — it would overload instead).
drop function if exists replace_device(uuid, uuid, uuid, text, text, uuid, text);

create or replace function replace_device(
  p_site_id uuid,
  p_old_device_id uuid,
  p_hardware_catalog_id uuid,
  p_esper_id text,
  p_name_on_esper text,
  p_approved_by uuid,
  p_notes text default null,
  p_replaced_at timestamptz default null
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

  insert into device_replacements (site_id, old_device_id, new_device_id, approved_by, notes, replaced_at)
  values (p_site_id, p_old_device_id, v_new_id, p_approved_by, nullif(btrim(p_notes), ''), coalesce(p_replaced_at, now()));

  return v_new_id;
end;
$$;

grant execute on function replace_device(uuid, uuid, uuid, text, text, uuid, text, timestamptz) to authenticated;
