-- Implementation Projects — site-level feature (spec §5.3).
--
-- When a sales order lands, a Site is onboarded through a 5-stage pipeline:
--   1 Sales Order · 2 Establish Contact · 3 Hardware Provision ·
--   4 Customer Onboarding · 5 Customer Success Handover.
--
-- The redesign (per the owner's brief) makes each stage an INDEPENDENTLY
-- saveable record, because different roles (Sales, Onboarding, CS) fill
-- different stages days or weeks apart. So a project is one parent row plus
-- exactly five stage rows, each with its own status and jsonb payload.
--
-- A Site can have MANY projects over time (one completed and handed over, a new
-- one starting today), each with its own independent status.
--
-- overall_status is COMPUTED from the five stage statuses by a trigger, never
-- set by the client, so it is always consistent no matter who writes.

-- Parent: one row per implementation project.
create table implementation_projects (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  -- Roll-up convenience so the Org 360 can group without a join through sites.
  org_id uuid not null references organizations(id),
  -- Human-friendly handle shown on the card, e.g. IMPL-MR624CKH-D0I. Generated
  -- in the server action (random, retried on clash).
  project_code text not null unique,
  project_name text not null,
  -- Derived from the 5 stage rows by trg_recompute_overall_status. Kept as a
  -- stored column (not a view) so the card list can sort/filter on it cheaply.
  overall_status text not null default 'not_started'
    check (overall_status in ('not_started', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Child: exactly five stage rows per project (enforced by the auto-create
-- trigger + the unique constraint below). All stage-specific fields live in
-- `data` jsonb — mirrors how Renewals/PO form store flexible payloads.
create table implementation_project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references implementation_projects(id) on delete cascade,
  stage_number int not null check (stage_number between 1 and 5),
  stage_status text not null default 'not_started'
    check (stage_status in ('not_started', 'in_progress', 'complete')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references internal_users(id),
  unique (project_id, stage_number)
);

-- Index FKs from the start (CLAUDE.md: keep the Site 360 fast). The project
-- list filters by site; the stepper loads all stages of one project.
create index implementation_projects_site_idx on implementation_projects (site_id);
create index implementation_projects_org_idx on implementation_projects (org_id);
create index implementation_project_stages_project_idx
  on implementation_project_stages (project_id);

-- When a project is created, seed its five stage rows (all not_started). Keeps
-- the "every project has exactly 5 stages" invariant in the database rather
-- than trusting every caller to insert them.
create or replace function seed_implementation_stages()
returns trigger
language plpgsql
as $$
begin
  insert into implementation_project_stages (project_id, stage_number)
  select new.id, gs from generate_series(1, 5) as gs;
  return new;
end;
$$;

create trigger trg_seed_implementation_stages
  after insert on implementation_projects
  for each row execute function seed_implementation_stages();

-- Recompute the parent's overall_status whenever a stage row changes:
--   all 5 not_started            -> not_started
--   all 5 complete               -> completed
--   otherwise (any progress)     -> in_progress
-- Also bumps updated_at so the card's "last updated" reflects stage edits.
create or replace function recompute_overall_status()
returns trigger
language plpgsql
as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_total int;
  v_complete int;
  v_untouched int;
  v_status text;
begin
  select
    count(*),
    count(*) filter (where stage_status = 'complete'),
    count(*) filter (where stage_status = 'not_started')
  into v_total, v_complete, v_untouched
  from implementation_project_stages
  where project_id = v_project;

  if v_total > 0 and v_complete = v_total then
    v_status := 'completed';
  elsif v_untouched = v_total then
    v_status := 'not_started';
  else
    v_status := 'in_progress';
  end if;

  update implementation_projects
    set overall_status = v_status,
        updated_at = now()
    where id = v_project;

  return null;
end;
$$;

create trigger trg_recompute_overall_status
  after insert or update or delete on implementation_project_stages
  for each row execute function recompute_overall_status();

-- Storage bucket for implementation files (quotations, PO copies, proof of
-- schedule, go-live email proof, handover notes, live-site photos). Private,
-- served via signed URLs — mirrors the PO-attachments setup
-- (20260630000007). Bytes never go in the DB (CLAUDE.md); metadata rows land
-- in `attachments`.
insert into storage.buckets (id, name, public)
values ('implementation-attachments', 'implementation-attachments', false)
on conflict (id) do nothing;

create policy "implementation_attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'implementation-attachments' and is_active_internal_user());

create policy "implementation_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'implementation-attachments' and is_admin_or_manager());

-- RLS: read = any active internal user; write = admin/manager (mirrors Spox).
alter table implementation_projects enable row level security;
alter table implementation_project_stages enable row level security;

create policy implementation_projects_select_internal on implementation_projects
  for select to authenticated using (is_active_internal_user());
create policy implementation_projects_write_admin_manager on implementation_projects
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());

create policy implementation_stages_select_internal on implementation_project_stages
  for select to authenticated using (is_active_internal_user());
create policy implementation_stages_write_admin_manager on implementation_project_stages
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
