-- ===========================================================================
-- MRR / ARR revenue recognition engine — schema (spec §7). ADDITIVE ONLY.
--
-- SAFETY CONTRACT (owner instruction, 2026-08-05): this migration must never
-- touch, move, edit, or delete any existing row. It only ADDS new empty columns
-- and one new empty table. There is deliberately NO update/delete/backfill of
-- existing data anywhere in this file. Every `add column` uses a default or is
-- nullable, so existing rows are left byte-for-byte unchanged.
--
-- Guarded with `if not exists` throughout so a re-run is a harmless no-op.
--
-- Two owner-confirmed model decisions baked in here:
--   * Renewal cycles are SYNTHETIC line items (decision A): a schedule row is
--     driven by EITHER a po_line_items row OR a renewals row, never both. Hence
--     line_item_id and renewal_cycle_id are both nullable with an exactly-one
--     check, and the renewals module is left untouched.
--   * Contract term is DERIVED from the existing purchase_orders.contract_time_id
--     -> contract_times.months. We deliberately do NOT add contract_term_years
--     (no second source of truth).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Line item (po_line_items) — new recognition fields. All nullable or
--    defaulted, so existing line items are unchanged and simply carry
--    coverage_months = 12 and a null method until someone sets one.
-- ---------------------------------------------------------------------------
alter table po_line_items
  add column if not exists recognition_method text
    check (recognition_method in ('saas', 'capex', 'opex', 'one_time'));

alter table po_line_items
  add column if not exists coverage_months smallint not null default 12
    check (coverage_months > 0);

-- Scope-change line items point back at the line they extend (spec §6). Never
-- edit the original; create a derived line instead.
alter table po_line_items
  add column if not exists derived_from_line_item_id uuid
    references po_line_items(id);

-- Let a line item be held out of revenue entirely, with a reason (spec §7).
alter table po_line_items
  add column if not exists revenue_excluded boolean not null default false;
alter table po_line_items
  add column if not exists revenue_exclusion_reason text;

-- ---------------------------------------------------------------------------
-- 2. Purchase order — cancellation marker only (spec §6, §7). Cancellation
--    zeroes forward months from this month; history is left untouched.
--    contract_term_years is intentionally omitted (derived from contract_time_id).
-- ---------------------------------------------------------------------------
alter table purchase_orders
  add column if not exists cancelled_effective_month date;

-- ---------------------------------------------------------------------------
-- 3. revenue_schedule — the materialised ledger (spec §7). One row per line
--    item (or renewal cycle) per month per component. Brand-new empty table;
--    nothing reads from or writes to existing tables to create it.
-- ---------------------------------------------------------------------------
create table if not exists revenue_schedule (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one of these is set (enforced below). line_item_id for original /
  -- scope-change lines; renewal_cycle_id for auto-generated renewal cycles.
  line_item_id     uuid references po_line_items(id) on delete cascade,
  renewal_cycle_id uuid references renewals(id)       on delete cascade,

  -- Denormalised for fast aggregation at PO / site / org level (spec §7).
  po_id   uuid not null references purchase_orders(id) on delete cascade,
  site_id uuid references sites(id),
  org_id  uuid not null references organizations(id),

  period_month date not null,               -- first day of the month
  fy_label     text not null,               -- e.g. "FY 2026-27"
  fy_quarter   smallint not null check (fy_quarter between 1 and 4),

  amount_paise bigint not null,

  component text not null
    check (component in ('saas', 'capex_upfront', 'capex_tail', 'opex', 'one_time')),
  is_recurring boolean not null,            -- true for saas / capex_tail / opex

  recognition_status text not null
    check (recognition_status in ('recognised', 'projected')),

  -- So the UI can flag rows that rest on an expected (not actual) date (spec §7).
  anchor_source text not null
    check (anchor_source in ('actual_go_live', 'expected_delivery')),

  generated_at       timestamptz not null default now(),
  generation_version integer not null default 1,

  -- A schedule row belongs to a line item XOR a renewal cycle, never both/neither.
  constraint revenue_schedule_one_source_ck check (
    (line_item_id is not null)::int + (renewal_cycle_id is not null)::int = 1
  )
);

-- Uniqueness per source (spec §7: unique on (line_item_id, period_month,
-- component)). Split into two partial indexes because the source is a XOR.
create unique index if not exists revenue_schedule_line_item_uq
  on revenue_schedule (line_item_id, period_month, component)
  where line_item_id is not null;

create unique index if not exists revenue_schedule_renewal_uq
  on revenue_schedule (renewal_cycle_id, period_month, component)
  where renewal_cycle_id is not null;

-- Aggregation indexes (CLAUDE.md: index FKs and date columns from the start).
create index if not exists revenue_schedule_po_idx      on revenue_schedule (po_id);
create index if not exists revenue_schedule_site_idx    on revenue_schedule (site_id);
create index if not exists revenue_schedule_org_idx     on revenue_schedule (org_id);
create index if not exists revenue_schedule_month_idx   on revenue_schedule (period_month);
create index if not exists revenue_schedule_fy_idx      on revenue_schedule (fy_label);
create index if not exists revenue_schedule_status_idx  on revenue_schedule (recognition_status);
create index if not exists revenue_schedule_line_idx    on revenue_schedule (line_item_id);
create index if not exists revenue_schedule_renewal_idx on revenue_schedule (renewal_cycle_id);

-- RLS: mirrors the renewals table (20260630000005). Read for any active
-- internal user; write for admin/manager (the regenerate function in step 2
-- will run security-definer). Guarded so a re-run does not error on the policies.
alter table revenue_schedule enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revenue_schedule'
      and policyname = 'revenue_schedule_select_internal'
  ) then
    execute 'create policy revenue_schedule_select_internal on revenue_schedule
      for select to authenticated using (is_active_internal_user())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revenue_schedule'
      and policyname = 'revenue_schedule_write_admin_manager'
  ) then
    execute 'create policy revenue_schedule_write_admin_manager on revenue_schedule
      for all to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager())';
  end if;
end $$;
