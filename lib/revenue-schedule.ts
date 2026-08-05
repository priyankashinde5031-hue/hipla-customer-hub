// Revenue schedule materialisation (MRR/ARR spec §5, §7).
//
// Two layers in one file, kept apart on purpose:
//   * PURE shaping — turns a resolved line item (value/method/anchor/coverage +
//     delivery + cancellation) into DB-ready schedule rows. No DB, unit-tested.
//   * DB wiring — resolves the anchor from the live tables, then delete+rewrites
//     revenue_schedule for one line item / renewal cycle. Takes an injected
//     Supabase client so it stays importable from server actions AND scripts.
//
// The MONEY math lives in one place only: lib/revenue-engine.ts. This file adds
// the calendar (FY labels), the two-state status, cancellation trimming, and the
// database plumbing around it — never a second copy of the spread arithmetic.
//
// SAFETY: the DB functions here only ever DELETE/INSERT rows in the new
// revenue_schedule table. They READ existing tables to resolve anchors, but
// never write to them. No customer-entered row is touched.

import {
  generateSchedule,
  isRecurringComponent,
  toYearMonth,
  type RecognitionMethod,
  type RevenueComponent,
} from "./revenue-engine";

// ---------------------------------------------------------------------------
// Financial year — Indian FY, April 1 → March 31 (spec §1). Label "FY 2026–27".
// ---------------------------------------------------------------------------

// The FY a given year-month falls in, as "FY 2026–27" (en dash, per spec §1).
export function fyLabel(yearMonth: string): string {
  const { year, month } = splitYm(yearMonth);
  const startYear = month >= 4 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `FY ${startYear}–${endShort}`;
}

// Fiscal quarter 1–4: Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar.
export function fyQuarter(yearMonth: string): number {
  const { month } = splitYm(yearMonth);
  const monthsFromApril = (month - 4 + 12) % 12; // Apr -> 0 … Mar -> 11
  return Math.floor(monthsFromApril / 3) + 1;
}

function splitYm(yearMonth: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`invalid year-month "${yearMonth}"`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

// "YYYY-MM" -> "YYYY-MM-01" (revenue_schedule.period_month is the month's 1st).
export function monthFirstDay(yearMonth: string): string {
  return `${yearMonth}-01`;
}

// Compare two "YYYY-MM" strings. Lexicographic works because the format is
// zero-padded and fixed-width.
function ymBefore(a: string, b: string): boolean {
  return a < b;
}

// ---------------------------------------------------------------------------
// Recognition status — two states, EVENT-DRIVEN (owner rule, 2026-08-05).
//   recognised = the order has gone live, or the renewal is marked done. Every
//                month of that schedule counts as recognised — past AND future.
//   projected  = not delivered yet: a line still on its expected-delivery date
//                (not live), or a renewal not yet marked done.
// It does NOT depend on today's date: a live order's future months are
// recognised the moment it goes live. "delivered" = a line item anchored on an
// ACTUAL go-live, or a renewal cycle marked done. (This replaces the earlier
// month-by-month "recognise as time passes" rule, and removes any need for a
// nightly recompute — status only changes on a go-live / renewal-done event.)
// ---------------------------------------------------------------------------

export type RecognitionStatus = "recognised" | "projected";
export type AnchorSource = "actual_go_live" | "expected_delivery";

export function assignStatus(delivered: boolean): RecognitionStatus {
  return delivered ? "recognised" : "projected";
}

// ---------------------------------------------------------------------------
// Pure shaping — a resolved line item -> DB-ready schedule rows (no ids yet).
// ---------------------------------------------------------------------------

export type ShapedRow = {
  period_month: string; // "YYYY-MM-01"
  fy_label: string;
  fy_quarter: number;
  amount_paise: number;
  component: RevenueComponent;
  is_recurring: boolean;
  recognition_status: RecognitionStatus;
  anchor_source: AnchorSource;
};

export type ShapeInput = {
  valuePaise: number;
  method: RecognitionMethod;
  anchorMonth: string; // "YYYY-MM" or "YYYY-MM-DD"
  coverageMonths: number;
  anchorSource: AnchorSource;
  delivered: boolean;
  // PO cancellation (spec §6): zero months on/after this month, history intact.
  cancelledEffectiveMonth?: string | null; // "YYYY-MM" / "YYYY-MM-DD" / null
};

export function shapeScheduleRows(input: ShapeInput): ShapedRow[] {
  const anchor = toYearMonth(input.anchorMonth);
  if (anchor === null) return [];

  const cancelMonth = input.cancelledEffectiveMonth
    ? toYearMonth(input.cancelledEffectiveMonth)
    : null;

  const raw = generateSchedule(
    input.valuePaise,
    input.method,
    anchor,
    input.coverageMonths,
  );

  const rows: ShapedRow[] = [];
  for (const r of raw) {
    // Cancellation trims forward months only (spec §6): drop months on/after the
    // cancellation month; leave everything before it exactly as it was.
    if (cancelMonth !== null && !ymBefore(r.month, cancelMonth)) continue;

    rows.push({
      period_month: monthFirstDay(r.month),
      fy_label: fyLabel(r.month),
      fy_quarter: fyQuarter(r.month),
      amount_paise: r.amount,
      component: r.component,
      is_recurring: isRecurringComponent(r.component),
      recognition_status: assignStatus(input.delivered),
      anchor_source: input.anchorSource,
    });
  }
  return rows;
}

// Today as "YYYY-MM" in IST (our users' calendar), matching lib/date.ts.
export function currentYearMonth(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 7);
}

// ===========================================================================
// DB wiring. Loosely-typed client (the supabase-js client) so this module needs
// no server-only import and is usable from server actions and backfill scripts.
// ===========================================================================

// Minimal shape of the supabase-js client methods we use, to avoid a hard type
// dependency while still catching typos.
type Db = {
  from: (table: string) => any;
};

const GENERATION_VERSION = 1;

// A schedule row ready to insert, = ShapedRow + the foreign keys.
type InsertRow = ShapedRow & {
  line_item_id: string | null;
  renewal_cycle_id: string | null;
  po_id: string;
  site_id: string | null;
  org_id: string;
  generation_version: number;
};

// Resolve a PO's anchor from the Implementation Project(s) linked to it
// (spec §4): actual go-live (stage 4) wins; else expected delivery (stage 1);
// else no anchor (the line item goes to the unrecognised worklist).
async function resolvePoAnchor(
  db: Db,
  poId: string,
): Promise<{ anchorMonth: string; anchorSource: AnchorSource } | null> {
  const { data: projects } = await db
    .from("implementation_projects")
    .select("id")
    .eq("po_id", poId);
  if (!projects || projects.length === 0) return null;

  const projectIds = projects.map((p: { id: string }) => p.id);
  const { data: stages } = await db
    .from("implementation_project_stages")
    .select("project_id, stage_number, data")
    .in("project_id", projectIds)
    .in("stage_number", [1, 4]);

  let earliestGoLive: string | null = null;
  let earliestExpected: string | null = null;
  for (const s of stages ?? []) {
    const val =
      s.stage_number === 4
        ? (s.data?.goLiveDate as string | undefined)
        : (s.data?.expectedDeliveryDate as string | undefined);
    const ym = toYearMonth(val);
    if (!ym) continue;
    if (s.stage_number === 4) {
      if (!earliestGoLive || ym < earliestGoLive) earliestGoLive = ym;
    } else {
      if (!earliestExpected || ym < earliestExpected) earliestExpected = ym;
    }
  }

  if (earliestGoLive) {
    return { anchorMonth: earliestGoLive, anchorSource: "actual_go_live" };
  }
  if (earliestExpected) {
    return { anchorMonth: earliestExpected, anchorSource: "expected_delivery" };
  }
  return null;
}

// The single site to attribute a PO's revenue to, for the denormalised site_id:
// the covered site when a PO covers exactly one, else null (org roll-up always
// works via org_id). Per-site splitting of a multi-site PO is out of scope here.
async function resolvePoSite(db: Db, poId: string): Promise<string | null> {
  const { data } = await db.from("po_sites").select("site_id").eq("po_id", poId);
  if (data && data.length === 1) return data[0].site_id as string;
  return null;
}

async function deleteScheduleFor(
  db: Db,
  key: "line_item_id" | "renewal_cycle_id",
  id: string,
): Promise<void> {
  await db.from("revenue_schedule").delete().eq(key, id);
}

// Regenerate the schedule for one PO line item (spec §7). Idempotent:
// delete the line item's rows, then re-insert. Produces zero rows (and clears
// any existing) when the line item is excluded, has no method, or has no anchor
// — those cases surface in the /revenue/unrecognised worklist instead.
export async function regenerateScheduleForLineItem(
  db: Db,
  lineItemId: string,
): Promise<{ inserted: number; reason?: string }> {
  const { data: li } = await db
    .from("po_line_items")
    .select(
      "id, po_id, amount_paise, recognition_method, coverage_months, revenue_excluded",
    )
    .eq("id", lineItemId)
    .single();

  if (!li) return { inserted: 0, reason: "line item not found" };

  await deleteScheduleFor(db, "line_item_id", lineItemId);

  if (li.revenue_excluded) return { inserted: 0, reason: "revenue excluded" };
  if (!li.recognition_method) return { inserted: 0, reason: "no method" };

  const { data: po } = await db
    .from("purchase_orders")
    .select("id, organization_id, cancelled_effective_month")
    .eq("id", li.po_id)
    .single();
  if (!po) return { inserted: 0, reason: "po not found" };

  const anchor = await resolvePoAnchor(db, li.po_id);
  if (!anchor) return { inserted: 0, reason: "no anchor" };

  const siteId = await resolvePoSite(db, li.po_id);

  const shaped = shapeScheduleRows({
    valuePaise: li.amount_paise,
    method: li.recognition_method as RecognitionMethod,
    anchorMonth: anchor.anchorMonth,
    coverageMonths: li.coverage_months ?? 12,
    anchorSource: anchor.anchorSource,
    delivered: anchor.anchorSource === "actual_go_live",
    cancelledEffectiveMonth: po.cancelled_effective_month,
  });

  if (shaped.length === 0) return { inserted: 0, reason: "empty schedule" };

  const rows: InsertRow[] = shaped.map((r) => ({
    ...r,
    line_item_id: lineItemId,
    renewal_cycle_id: null,
    po_id: li.po_id,
    site_id: siteId,
    org_id: po.organization_id,
    generation_version: GENERATION_VERSION,
  }));

  await db.from("revenue_schedule").insert(rows);
  return { inserted: rows.length };
}

// Regenerate the schedule for one renewal cycle (spec §4, §8). Renewals are
// synthetic line items: method is always SaaS; value is the actual renewal
// value once done, else the expected value; coverage is the cycle's term; anchor
// is the renewal period start (override → PO go-live+offset → expected+offset).
export async function regenerateScheduleForRenewalCycle(
  db: Db,
  renewalId: string,
): Promise<{ inserted: number; reason?: string }> {
  const { data: rn } = await db
    .from("renewals")
    .select(
      "id, po_id, organization_id, anchor_site_id, offset_months, term_months, expected_value_paise, renewal_value_paise, renewal_date_override, status",
    )
    .eq("id", renewalId)
    .single();

  if (!rn) return { inserted: 0, reason: "renewal not found" };

  await deleteScheduleFor(db, "renewal_cycle_id", renewalId);

  const done = rn.status === "renewed";
  const value = done
    ? rn.renewal_value_paise ?? rn.expected_value_paise
    : rn.expected_value_paise;
  if (value == null) return { inserted: 0, reason: "no value" };

  // Anchor: manual override wins for the DATE; otherwise the PO's anchor + this
  // cycle's offset. The source label follows the PO's anchor kind.
  const poAnchor = await resolvePoAnchor(db, rn.po_id);
  let anchorMonth: string | null = null;
  let anchorSource: AnchorSource = "expected_delivery";

  if (rn.renewal_date_override) {
    anchorMonth = toYearMonth(rn.renewal_date_override);
    anchorSource = poAnchor?.anchorSource ?? "expected_delivery";
  } else if (poAnchor) {
    anchorMonth = addMonthsYm(poAnchor.anchorMonth, rn.offset_months);
    anchorSource = poAnchor.anchorSource;
  }
  if (!anchorMonth) return { inserted: 0, reason: "no anchor" };

  const { data: po } = await db
    .from("purchase_orders")
    .select("cancelled_effective_month")
    .eq("id", rn.po_id)
    .single();

  const shaped = shapeScheduleRows({
    valuePaise: value,
    method: "saas",
    anchorMonth,
    coverageMonths: rn.term_months ?? 12,
    anchorSource,
    delivered: done, // a renewal is delivered (→ recognised) once marked done
    cancelledEffectiveMonth: po?.cancelled_effective_month ?? null,
  });

  if (shaped.length === 0) return { inserted: 0, reason: "empty schedule" };

  const siteId = rn.anchor_site_id ?? (await resolvePoSite(db, rn.po_id));

  const rows: InsertRow[] = shaped.map((r) => ({
    ...r,
    line_item_id: null,
    renewal_cycle_id: renewalId,
    po_id: rn.po_id,
    site_id: siteId,
    org_id: rn.organization_id,
    generation_version: GENERATION_VERSION,
  }));

  await db.from("revenue_schedule").insert(rows);
  return { inserted: rows.length };
}

// "YYYY-MM" + n months. Small local copy so this file doesn't import the engine
// internals; equivalent to addYearMonths there.
function addMonthsYm(yearMonth: string, months: number): string {
  const { year, month } = splitYm(yearMonth);
  const zero = month - 1 + months;
  const y = year + Math.floor(zero / 12);
  const m = ((zero % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

// (No nightly status recompute: status is now event-driven — a schedule is
// recognised the moment its order goes live or its renewal is marked done, for
// every month, so nothing changes merely because a date passed. Status is only
// (re)written when those events fire the regenerate triggers, or on a full
// backfill. The `recompute` CLI command therefore just runs a full backfill.)

// Read revenue_schedule rows for reporting, paging past Supabase's default
// 1000-row cap so aggregates are never silently truncated. `applyFilter` narrows
// the rows (e.g. by fy_label or period_month). Returns only the reporting fields.
export type ScheduleReportRow = {
  period_month: string;
  amount_paise: number;
  is_recurring: boolean;
  recognition_status: "recognised" | "projected";
};

export async function fetchScheduleRowsPaged(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilter: (q: any) => any,
): Promise<ScheduleReportRow[]> {
  const PAGE = 1000;
  const out: ScheduleReportRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = db
      .from("revenue_schedule")
      .select("period_month, amount_paise, is_recurring, recognition_status");
    const { data } = await applyFilter(q).range(offset, offset + PAGE - 1);
    const rows = (data ?? []) as ScheduleReportRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Regenerate every schedule tied to one PO — all its line items and all its
// renewal cycles. Used by the "go-live date set" / "expected-delivery change" /
// "PO cancellation" triggers (spec §7), which re-anchor the whole PO at once.
export async function regenerateScheduleForPo(
  db: Db,
  poId: string,
): Promise<{ rows: number }> {
  let rows = 0;
  const { data: lineItems } = await db
    .from("po_line_items")
    .select("id")
    .eq("po_id", poId);
  for (const li of lineItems ?? []) {
    rows += (await regenerateScheduleForLineItem(db, li.id)).inserted;
  }
  const { data: renewals } = await db
    .from("renewals")
    .select("id")
    .eq("po_id", poId);
  for (const rn of renewals ?? []) {
    rows += (await regenerateScheduleForRenewalCycle(db, rn.id)).inserted;
  }
  return { rows };
}

// Full backfill (spec §7, §13): rebuild the entire ledger from scratch. Walks
// every PO line item and every renewal cycle. Safe to run repeatedly.
export async function backfillAllSchedules(
  db: Db,
): Promise<{ lineItems: number; renewals: number; rows: number }> {
  let rows = 0;

  const { data: lineItems } = await db.from("po_line_items").select("id");
  for (const li of lineItems ?? []) {
    const res = await regenerateScheduleForLineItem(db, li.id);
    rows += res.inserted;
  }

  const { data: renewals } = await db.from("renewals").select("id");
  for (const rn of renewals ?? []) {
    const res = await regenerateScheduleForRenewalCycle(db, rn.id);
    rows += res.inserted;
  }

  return {
    lineItems: lineItems?.length ?? 0,
    renewals: renewals?.length ?? 0,
    rows,
  };
}
