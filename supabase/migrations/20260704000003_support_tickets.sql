-- Support Tickets — site-level feature (spec §5.9).
--
-- A support ticket records a customer issue logged for a site: a helpdesk
-- reference ("Ticket ID"), what the ticket is about (a short subject), when it
-- was opened, and — once resolved — when it was closed. Tickets belong to
-- exactly one Site (spec §5.1: operations data is site-scoped).
--
-- DECISION (spec §5.9): the spec's SupportTicket also carries topic/category,
-- priority, status enum, source, and optional module. The owner's v1 ask is the
-- minimal log — Ticket ID, subject, opened date, closed date — so this migration
-- ships just those fields. Status is DERIVED, never stored: a ticket is "Open"
-- until it has a closed_date, then "Closed". Topic/priority/CSV-import stay
-- deferred to the fuller Support milestone (spec §11 item 8).

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  -- Helpdesk reference the team types in (e.g. Zoho "#12345"). Free text, not a
  -- DB key. Optional — a ticket can be logged before its ref is known.
  ticket_ref text,
  -- "Ticket about" — a short subject describing the issue (spec §5.9 subject).
  subject text not null,
  -- Business dates. Opened defaults to today; closed is null while still open.
  opened_date date not null default current_date,
  closed_date date,
  -- Who logged the ticket (audit + "created by").
  created_by uuid not null references internal_users(id),
  -- Soft-delete over destructive edits (CLAUDE.md). Hidden from the list but kept.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A ticket can't close before it opened.
  constraint support_tickets_close_after_open
    check (closed_date is null or closed_date >= opened_date)
);

-- The list filters live rows by site and orders by opened date; index the FKs
-- and the hot path (CLAUDE.md: index FKs and date columns from the start).
create index support_tickets_site_live_idx
  on support_tickets (site_id, opened_date desc) where deleted_at is null;
create index support_tickets_created_by_idx on support_tickets (created_by);

-- RLS mirrors Spox / Scope Changes exactly: read = any active internal user;
-- write = admin/manager only. Helpers already exist from earlier migrations.
alter table support_tickets enable row level security;

create policy support_tickets_select_internal on support_tickets
  for select to authenticated using (is_active_internal_user());
create policy support_tickets_insert_admin_manager on support_tickets
  for insert to authenticated with check (is_admin_or_manager());
create policy support_tickets_update_admin_manager on support_tickets
  for update to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
