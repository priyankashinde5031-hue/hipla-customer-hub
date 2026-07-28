// DB loader for the dashboard's Layer 1 business-health tiles (ARR / MRR /
// Revenue this FY / NRR·GRR) plus the "positive" pairings the restyled worklist
// shows next to each alarm (collected this month, renewals secured this month).
//
// It assembles the commercial rows into the plain shapes the pure helpers in
// lib/arr-metrics.ts expect, then computes every figure on read — nothing is
// stored (CLAUDE.md). Recurring-only: one-time line items fall out naturally via
// their renewal_term logic (lib/renewals.ts).
//
// DECISION (spec §5.4, §13): this app stores each recurring line's amount as its
// ANNUAL fee (the renewal math in lib/renewals.ts already treats qty×unit_price
// as the per-year figure and escalates it per contract year). So ARR uses that
// annual value directly rather than dividing a total-contract-value by term. If
// the owner later records multi-year lines as a lump total, revisit here.
//
// DECISION (spec §5.4): we have no explicit "customer churned / PO cancelled"
// signal yet, so v1 ARR does not spontaneously drop to ₹0 — a live recurring
// license keeps renewing. NRR/GRR therefore capture expansion/contraction from
// actual recorded renewals (real renewed value vs projected), but churn will
// read ~0 until a cancellation signal exists. Flagged for the owner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { renewalExpectedPaise, RENEWAL_LOGIC, type RenewalLine } from "./renewals";
import { COST_RECURRENCE } from "./cost-types";
import {
  todayIso,
  type DashboardFilter,
} from "./dashboard-metrics";
import {
  arrByCustomerAsOf,
  arrSeries,
  arrTotalAsOf,
  deltaPct,
  fyBounds,
  fyStartIso,
  recognizedSeries,
  retention,
  trailingMonthEnds,
  type PoArr,
} from "./arr-metrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

// Contract years we resolve an annual value for. Dates beyond this clamp to the
// last cycle in poArrPaise, so 10 covers every realistic horizon.
const ARR_HORIZON_YEARS = 10;

export type Sparkline = number[];

export type HealthMetrics = {
  asOf: string; // the point-in-time date ARR/MRR are measured at
  monthLabels: string[]; // short month labels for the trailing-12m series (e.g. "Aug")
  // arr delta is year-on-year; mrr delta is month-on-month (its natural cadence).
  arr: { valuePaise: number; priorValuePaise: number; deltaPct: number | null; series: Sparkline };
  mrr: { valuePaise: number; priorValuePaise: number; deltaPct: number | null; series: Sparkline };
  revenueFy: {
    valuePaise: number;
    priorValuePaise: number;
    deltaPct: number | null;
    label: string; // e.g. "FY 2026–27"
    series: Sparkline; // revenue recognised per trailing month (recurring ÷12 + one-time lumps)
  };
  retention: {
    nrr: number | null;
    grr: number | null;
    windowLabel: string; // e.g. "T12M to Jul 2026"
  };
  positives: {
    collectedThisMonthPaise: number;
    renewalsSecuredThisMonthPaise: number;
    renewalsSecuredCount: number;
  };
  // Booked value within the selected financial year (owner ask): new POs raised
  // this FY, and renewals recorded as "renewed" this FY. Both scoped by the
  // active customer/module filter and the FY window.
  fyBookings: {
    fyLabel: string; // e.g. "FY 2026–27"
    windowLabel: string; // e.g. "1 Apr 2026 – 31 Mar 2027"
    newOrderValuePaise: number;
    newOrderCount: number;
    renewalDoneValuePaise: number;
    renewalDoneCount: number;
  };
};

function flatten<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

// Just the short month (e.g. "Aug"), for the 12-month chart x-axis.
function shortMonthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

function fyLabel(startIso: string): string {
  const y = Number(startIso.slice(0, 4));
  return `FY ${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

// Which FY / as-of date the current filter selects. Default and the worklist
// ranges (week/month/quarter) all report the FY-in-progress as of today; the FY
// selector picks this or last FY (spec: NRR/GRR tie to a FY selector, not "this
// month").
function resolveWindow(filter: DashboardFilter, today: string): {
  asOf: string;
  fy: { start: string; end: string };
} {
  if (filter.range === "lastfy") {
    const fy = fyBounds(today, "last");
    // "as of" the close of last FY (Mar 31), so ARR is point-in-time correct.
    const asOf = fy.end < today ? isoDayBefore(fy.end) : today;
    return { asOf, fy };
  }
  return { asOf: today, fy: fyBounds(today, "this") };
}

function isoDayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Subtract whole months from a yyyy-mm-dd (clamping the day), for the T12M start.
function minusMonths(iso: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const zeroBased = Number(m[2]) - 1 - months;
  const year = Number(m[1]) + Math.floor(zeroBased / 12);
  const monthIndex0 = ((zeroBased % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), lastDay);
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Month-end dates for the months of a financial year that have started by
// `cap` (exclusive). This FY passes today as the cap (so it stops at the
// current month); a fully-elapsed FY passes its end (Apr 1) and yields all 12.
function monthEndsInFy(fyStart: string, cap: string): string[] {
  const y = Number(fyStart.slice(0, 4));
  const m = Number(fyStart.slice(5, 7)); // 4 = April
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const zero = m - 1 + i;
    const year = y + Math.floor(zero / 12);
    const monthIndex0 = ((zero % 12) + 12) % 12;
    const first = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
    if (first >= cap) break; // month not yet started within the window
    const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
    out.push(`${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
  }
  return out;
}

export async function getHealthMetrics(
  supabase: Db,
  filter: DashboardFilter = {},
): Promise<HealthMetrics> {
  const today = todayIso();
  const { asOf, fy } = resolveWindow(filter, today);

  const [
    posRes,
    lineItemsRes,
    termsRes,
    costTypesRes,
    poModulesRes,
    projectsRes,
    renewalsRes,
    invoicesRes,
    paymentsRes,
  ] = await Promise.all([
    supabase.from("purchase_orders").select("id, organization_id, contract_time_id, po_received_date"),
    supabase
      .from("po_line_items")
      .select("po_id, qty, unit_price_paise, renewal_term_id, cost_type_id"),
    supabase.from("renewal_terms").select("id, logic, escalation_pct, amc_pct"),
    // select * so the loader keeps working before the recurrence column exists;
    // `recurrence` is simply undefined until the migration is applied.
    supabase.from("cost_types").select("*"),
    supabase.from("po_modules").select("po_id, module_id"),
    supabase
      .from("implementation_projects")
      .select("po_id, stages:implementation_project_stages(stage_number, data)"),
    supabase
      .from("renewals")
      .select("po_id, organization_id, year_number, status, renewal_value_paise, renewal_received_date"),
    supabase
      .from("invoices")
      .select(
        "id, po_id, amount_paise, issue_date, due_date, status, billed_site:sites!billed_site_id(organization_id)",
      ),
    supabase.from("payments").select("invoice_id, amount_paise, received_date"),
  ]);

  // --- Lookups -------------------------------------------------------------
  const termById = new Map<string, { logic: string | null; escalationPct: number | null; amcPct: number | null }>();
  for (const t of termsRes.data ?? []) {
    termById.set(t.id, {
      logic: (t.logic as string | null) ?? null,
      escalationPct: (t.escalation_pct as number | null) ?? null,
      amcPct: (t.amc_pct as number | null) ?? null,
    });
  }

  // Cost type → recurring vs one-time. `recurrence` is only present once the
  // migration is applied; until then it is undefined and we fall back to the
  // line's renewal term (one-time logic ⇒ one-time, everything else recurring).
  const costRecurrenceById = new Map<string, string | undefined>();
  for (const ct of costTypesRes.data ?? []) {
    costRecurrenceById.set(ct.id, (ct.recurrence as string | undefined) ?? undefined);
  }

  // Per-PO go-live: the linked implementation project's Stage-4 go-live date.
  const poGoLive = new Map<string, string>();
  for (const p of projectsRes.data ?? []) {
    if (!p.po_id) continue;
    const stage4 = (p.stages ?? []).find((s: { stage_number: number }) => s.stage_number === 4);
    const gl = (stage4?.data as { goLiveDate?: string } | null)?.goLiveDate;
    if (gl && !poGoLive.has(p.po_id)) poGoLive.set(p.po_id, gl);
  }

  // Split each PO's lines into its RECURRING lines (which drive ARR, escalated
  // per contract year) and its ONE-TIME total (recognised once, in the go-live
  // month). Recurring vs one-time is decided by the line's Cost type; when the
  // cost type has no recurrence set yet, we fall back to the Renewal term.
  const recurringLinesByPo = new Map<string, RenewalLine[]>();
  const oneTimePaiseByPo = new Map<string, number>();
  // Full PO value (all lines, recurring + one-time) — used for the "new order
  // value booked this FY" figure.
  const poTotalPaise = new Map<string, number>();
  for (const li of lineItemsRes.data ?? []) {
    const term = li.renewal_term_id ? termById.get(li.renewal_term_id) : undefined;
    const base = Math.round(Number(li.qty) * Number(li.unit_price_paise));
    poTotalPaise.set(li.po_id, (poTotalPaise.get(li.po_id) ?? 0) + base);
    const recurrence = li.cost_type_id ? costRecurrenceById.get(li.cost_type_id) : undefined;

    let recurring: boolean;
    if (recurrence === COST_RECURRENCE.recurring) recurring = true;
    else if (recurrence === COST_RECURRENCE.oneTime) recurring = false;
    else recurring = term?.logic !== RENEWAL_LOGIC.oneTime; // fallback: recurring unless one-time term

    if (recurring) {
      // A recurring line escalates if its renewal term says so; otherwise the
      // value repeats flat each year. (One-time/AMC renewal logic is ignored
      // here — the Cost type already decided this line is recurring.)
      const escalating = term?.logic === RENEWAL_LOGIC.escalation;
      const arr = recurringLinesByPo.get(li.po_id) ?? [];
      arr.push({
        basePaise: base,
        logic: escalating ? RENEWAL_LOGIC.escalation : RENEWAL_LOGIC.flat,
        escalationPct: escalating ? (term?.escalationPct ?? null) : null,
        amcPct: null,
      });
      recurringLinesByPo.set(li.po_id, arr);
    } else {
      oneTimePaiseByPo.set(li.po_id, (oneTimePaiseByPo.get(li.po_id) ?? 0) + base);
    }
  }

  const modulesByPo = new Map<string, Set<string>>();
  for (const pm of poModulesRes.data ?? []) {
    let set = modulesByPo.get(pm.po_id);
    if (!set) {
      set = new Set();
      modulesByPo.set(pm.po_id, set);
    }
    set.add(pm.module_id);
  }

  // Actual renewed cycle values, keyed po → year_number → value (real expansion).
  const renewedValue = new Map<string, Map<number, number>>();
  for (const r of renewalsRes.data ?? []) {
    if (r.status !== "renewed" || r.renewal_value_paise == null) continue;
    let m = renewedValue.get(r.po_id);
    if (!m) {
      m = new Map();
      renewedValue.set(r.po_id, m);
    }
    m.set(Number(r.year_number), Number(r.renewal_value_paise));
  }

  const matchesCustomer = (orgId: string | null | undefined) =>
    !filter.customerId || orgId === filter.customerId;
  const poMatchesModule = (poId: string) =>
    !filter.moduleId || (modulesByPo.get(poId)?.has(filter.moduleId) ?? false);

  // --- Build the ARR + recognition view of every (filtered) PO -------------
  const pos: PoArr[] = [];
  for (const po of posRes.data ?? []) {
    if (!matchesCustomer(po.organization_id)) continue;
    if (!poMatchesModule(po.id)) continue;

    const recurringLines = recurringLinesByPo.get(po.id) ?? [];
    // Recurring annual value per contract year (year 1 = base, later years
    // escalate). One-time lines are excluded here and recognised separately.
    const cycleAnnualPaise: number[] = [];
    const overrides = renewedValue.get(po.id);
    for (let year = 1; year <= ARR_HORIZON_YEARS; year++) {
      const projected = renewalExpectedPaise(recurringLines, year);
      // A recorded renewal for this contract year wins over the projection.
      cycleAnnualPaise.push(overrides?.get(year) ?? projected);
    }

    pos.push({
      poId: po.id,
      orgId: po.organization_id ?? null,
      goLive: poGoLive.get(po.id) ?? null,
      moduleIds: [...(modulesByPo.get(po.id) ?? [])],
      cycleAnnualPaise,
      oneTimePaise: oneTimePaiseByPo.get(po.id) ?? 0,
    });
  }

  // --- ARR / MRR (point-in-time as of `asOf`) ------------------------------
  // One shared trailing-12-month axis for every series + the month-by-month chart.
  const trailingEnds = trailingMonthEnds(asOf, 12);
  const monthLabels = trailingEnds.map(shortMonthLabel);
  const arrNow = arrTotalAsOf(pos, asOf);
  const asOfYearAgo = minusMonths(asOf, 12);
  const arrYearAgo = arrTotalAsOf(pos, asOfYearAgo);
  const arrSpark = arrSeries(pos, trailingEnds);
  const mrrSpark = arrSpark.map((v) => Math.round(v / 12));
  // MRR reads month-on-month: this month's ARR/12 vs last month's.
  const mrrNow = Math.round(arrNow / 12);
  const mrrLastMonth = mrrSpark.length >= 2 ? mrrSpark[mrrSpark.length - 2] : 0;

  // --- NRR / GRR over the T12M cohort ending at `asOf` ---------------------
  const startByCust = arrByCustomerAsOf(pos, asOfYearAgo);
  const nowByCust = arrByCustomerAsOf(pos, asOf);
  const ret = retention(startByCust, nowByCust);

  // --- Revenue recognised (owner's rule) -----------------------------------
  // Monthly recognition: recurring value ÷ 12 each month + one-time lumps in
  // their go-live month + renewal value ÷ 12 once a renewal takes over. The
  // trailing-12m series feeds the chart; the FY totals feed the Revenue tile.
  const revSeries = recognizedSeries(pos, trailingEnds);
  const priorFy = fyBounds(fyStartIso(asOf), "last");
  const revenueFyPaise = recognizedSeries(pos, monthEndsInFy(fy.start, asOf)).reduce((a, b) => a + b, 0);
  const revenuePriorFyPaise = recognizedSeries(pos, monthEndsInFy(priorFy.start, priorFy.end))
    .reduce((a, b) => a + b, 0);

  // --- Positives that pair with the worklist alarms (current calendar month)
  const monthPrefix = today.slice(0, 7);
  // Map invoice → PO + org for filter-aware payment attribution.
  const invoicePo = new Map<string, string>();
  const invoiceOrg = new Map<string, string | undefined>();
  for (const inv of invoicesRes.data ?? []) {
    invoicePo.set(inv.id, inv.po_id);
    invoiceOrg.set(
      inv.id,
      (flatten(inv.billed_site) as { organization_id?: string } | null)?.organization_id,
    );
  }
  let collectedThisMonth = 0;
  for (const pay of paymentsRes.data ?? []) {
    if (!pay.received_date || pay.received_date.slice(0, 7) !== monthPrefix) continue;
    const poId = invoicePo.get(pay.invoice_id);
    if (poId && !poMatchesModule(poId)) continue;
    if (!matchesCustomer(invoiceOrg.get(pay.invoice_id))) continue;
    collectedThisMonth += Number(pay.amount_paise);
  }

  let renewalsSecuredPaise = 0;
  let renewalsSecuredCount = 0;
  for (const r of renewalsRes.data ?? []) {
    if (r.status !== "renewed" || !r.renewal_received_date) continue;
    if (r.renewal_received_date.slice(0, 7) !== monthPrefix) continue;
    if (!poMatchesModule(r.po_id)) continue;
    if (!matchesCustomer(r.organization_id)) continue;
    renewalsSecuredPaise += Number(r.renewal_value_paise ?? 0);
    renewalsSecuredCount += 1;
  }

  // --- Booked value this FY (owner ask) ------------------------------------
  // New orders: POs whose received date falls inside the selected FY window
  // [fy.start, fy.end), valued at their full line-item total. Renewals are
  // recorded on the renewals table (not as new POs), so the two never overlap.
  let newOrderValuePaise = 0;
  let newOrderCount = 0;
  for (const po of posRes.data ?? []) {
    const d = po.po_received_date as string | null;
    if (!d || d < fy.start || d >= fy.end) continue;
    if (!matchesCustomer(po.organization_id)) continue;
    if (!poMatchesModule(po.id)) continue;
    newOrderValuePaise += poTotalPaise.get(po.id) ?? 0;
    newOrderCount += 1;
  }

  // Renewals done: cycles marked "renewed" whose received date is in the FY.
  let renewalDoneValuePaise = 0;
  let renewalDoneCount = 0;
  for (const r of renewalsRes.data ?? []) {
    if (r.status !== "renewed" || !r.renewal_received_date) continue;
    const d = r.renewal_received_date as string;
    if (d < fy.start || d >= fy.end) continue;
    if (!poMatchesModule(r.po_id)) continue;
    if (!matchesCustomer(r.organization_id)) continue;
    renewalDoneValuePaise += Number(r.renewal_value_paise ?? 0);
    renewalDoneCount += 1;
  }

  const fyEndInclusive = isoDayBefore(fy.end);
  const fyWindowLabel = `${fmtDay(fy.start)} – ${fmtDay(fyEndInclusive)}`;

  return {
    asOf,
    monthLabels,
    arr: {
      valuePaise: arrNow,
      priorValuePaise: arrYearAgo,
      deltaPct: deltaPct(arrNow, arrYearAgo),
      series: arrSpark,
    },
    mrr: {
      valuePaise: mrrNow,
      priorValuePaise: mrrLastMonth,
      deltaPct: deltaPct(mrrNow, mrrLastMonth),
      series: mrrSpark,
    },
    revenueFy: {
      valuePaise: revenueFyPaise,
      priorValuePaise: revenuePriorFyPaise,
      deltaPct: deltaPct(revenueFyPaise, revenuePriorFyPaise),
      label: fyLabel(fy.start),
      series: revSeries,
    },
    retention: {
      nrr: ret.nrr,
      grr: ret.grr,
      windowLabel: `T12M to ${monthLabel(asOf)}`,
    },
    positives: {
      collectedThisMonthPaise: collectedThisMonth,
      renewalsSecuredThisMonthPaise: renewalsSecuredPaise,
      renewalsSecuredCount,
    },
    fyBookings: {
      fyLabel: fyLabel(fy.start),
      windowLabel: fyWindowLabel,
      newOrderValuePaise,
      newOrderCount,
      renewalDoneValuePaise,
      renewalDoneCount,
    },
  };
}

// Day label like "1 Apr 2026" for the FY window caption.
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
