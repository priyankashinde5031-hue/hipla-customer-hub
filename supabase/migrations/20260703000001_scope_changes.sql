-- Scope Changes — site-level feature (spec §5.7).
--
-- A scope change records a requested modification to what Hipla is delivering
-- at a customer site: a description, when it happened, its impact ("Timeline +2
-- weeks"), an internal approver, and an approval status. Per the owner's
-- decision this is INDEPENDENT of implementation projects — it hangs directly
-- off the Site, so it works before the Implementation module (Milestone 5)
-- exists.
--
-- DECISION (spec §5.7): the spec lists a 4th status 'applied' (a change that has
-- been merged into the ScopeItem baseline). ScopeItems don't exist yet, so v1
-- ships the three states the owner's brief specifies (pending/approved/
-- rejected); 'applied' is deferred until Implementation lands.
--
-- DECISION (spec §5.8): the prototype gated scope changes behind a 6-digit OTP.
-- The owner dropped OTP for v1 (no email/SMS provider is wired yet), so there is
-- no OTP table and no verification step — the change is recorded directly and
-- the approver is recorded but not yet emailed.

create table scope_changes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  description text not null,
  -- Business date the change was requested/effective; defaults to today.
  change_date date not null default current_date,
  -- Free text, e.g. "Timeline +2 weeks". Optional (spec §5.7).
  impact text,
  -- Approver is always an internal Hipla user (spec §13, RESOLVED). Reuses the
  -- same internal_users list as PO owner / Spox owner / device approver.
  approver_id uuid not null references internal_users(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  -- Who recorded the change (audit + "requested by").
  created_by uuid not null references internal_users(id),
  -- Soft-delete over destructive edits (CLAUDE.md). Rows are never hard-deleted
  -- from the UI; deleting sets this and hides the row from the timeline/summary.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index the site scope (the card count + timeline both filter live rows by site)
-- and the approver FK (CLAUDE.md: index FKs and the hot query paths).
create index scope_changes_site_live_idx on scope_changes (site_id) where deleted_at is null;
create index scope_changes_approver_idx on scope_changes (approver_id);
create index scope_changes_created_by_idx on scope_changes (created_by);

-- RLS mirrors Spox exactly: read = any active internal user; write =
-- admin/manager only. Helpers already exist from earlier migrations.
alter table scope_changes enable row level security;

create policy scope_changes_select_internal on scope_changes
  for select to authenticated using (is_active_internal_user());
create policy scope_changes_insert_admin_manager on scope_changes
  for insert to authenticated with check (is_admin_or_manager());
-- Status decisions and soft-delete both go through UPDATE.
create policy scope_changes_update_admin_manager on scope_changes
  for update to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
