-- Agreements — a site-level document store (owner request, July 2026).
--
-- Each agreement records a signed legal document held for a customer site: when
-- it was signed, what kind it is (from a Settings-managed catalog), the file
-- itself (stored in Supabase Storage, never in the DB — CLAUDE.md), and who on
-- the Hipla side signed it (an internal user). Agreements belong to exactly one
-- Site (spec §5.1: operations data is site-scoped), mirroring Support tickets.

-- 1) Agreement Type — managed reference data (CLAUDE.md: "reference data is
-- data, not code"), editable in Settings via the generic catalog editor. Same
-- minimal shape as cost_types / po_types: a unique name + an active flag.
create table agreement_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

-- Seed the four built-in types the owner asked for. Idempotent so a re-run (or
-- the fresh-setup seed) never duplicates them.
insert into agreement_types (name) values
  ('NDA'),
  ('Service Agreement'),
  ('PO Agreement'),
  ('Addendum')
on conflict (name) do nothing;

alter table agreement_types enable row level security;

create policy agreement_types_select_internal on agreement_types
  for select to authenticated using (is_active_internal_user());
create policy agreement_types_write_admin_manager on agreement_types
  for all to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());

-- 2) Agreements — one row per stored document for a site.
create table agreements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  -- When the agreement was signed (business date).
  signed_date date not null,
  -- What kind of agreement (NDA / Service Agreement / …). Restrict to the
  -- catalog; keep the row if the type is later deactivated.
  agreement_type_id uuid not null references agreement_types(id),
  -- The uploaded file (metadata row in `attachments`; bytes in Storage).
  attachment_id uuid references attachments(id),
  -- Who signed it on our side — links the Users catalogue (internal_users).
  signed_by_id uuid references internal_users(id),
  -- Who logged it (audit + "created by").
  created_by uuid not null references internal_users(id),
  -- Soft-delete over destructive edits (CLAUDE.md). Hidden from the list, kept.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list filters live rows by site and orders by signed date; index the FKs
-- and the hot path (CLAUDE.md: index FKs and date columns from the start).
create index agreements_site_live_idx
  on agreements (site_id, signed_date desc) where deleted_at is null;
create index agreements_type_idx on agreements (agreement_type_id);
create index agreements_signed_by_idx on agreements (signed_by_id);

-- RLS mirrors Support / Spox / Scope Changes exactly: read = any active
-- internal user; write = admin/manager only. Helpers exist from earlier migrations.
alter table agreements enable row level security;

create policy agreements_select_internal on agreements
  for select to authenticated using (is_active_internal_user());
create policy agreements_insert_admin_manager on agreements
  for insert to authenticated with check (is_admin_or_manager());
create policy agreements_update_admin_manager on agreements
  for update to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());

-- 3) Storage bucket for the agreement files. Private, served via signed URLs —
-- mirrors the po-attachments / renewal-attachments setup.
insert into storage.buckets (id, name, public)
values ('agreement-attachments', 'agreement-attachments', false)
on conflict (id) do nothing;

create policy "agreement_attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'agreement-attachments' and is_active_internal_user());

create policy "agreement_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agreement-attachments' and is_admin_or_manager());
