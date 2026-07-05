// Portfolio metrics for the CEO dashboard. Every figure is computed on read
// from the underlying rows — nothing is stored (CLAUDE.md: money and derived
// figures are computed, never hand-totaled). This is a money-first extension of
// lib/org-list-metrics.ts: same batched-query pattern and the same PO go-live
// anchor resolution, but it returns ₹ values + the sorted action lists the
// dashboard panels and the four module pages render.
//
// The pure helpers (date math, aging buckets, at-risk/deviation gating) are
// exported and unit-tested (dashboard-metrics.test.ts) — these are exactly the
// aging/renewal/deviation rules CLAUDE.md says to test first.

import type { SupabaseClient } from "@supabase/supabase-js";
import { renewalDate, deviationPercent } from "./renewals";
import {
  USAGE_DEVIATION_ALERT_PCT,
  STAGE_STALL_DAYS,
  RENEWAL_UPCOMING_DAYS,
  INVOICE_UPCOMING_DAYS,
} from "./dashboard-config";

// ---------------------------------------------------------------------------
// Pure date + bucketing helpers (unit-tested).
// ---------------------------------------------------------------------------

// Today as YYYY-MM-DD in local time (matches how dates are stored/compared).
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Whole days from `fromIso` to `toIso` (both YYYY-MM-DD). Positive when `toIso`
// is later. Returns null on unparseable input. Timezone-safe (parses via UTC).
export function diffDays(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): number | null {
  if (!fromIso || !toIso) return null;
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso.trim());
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIso.trim());
  if (!a || !b) return null;
  const at = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const bt = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((bt - at) / 86_400_000);
}

// Aging tag for an overdue RENEWAL, by days overdue (spec §2.1: 0–30d / 31–90d
// / 90d+). Only meaningful for overdue rows.
export type RenewalAging = "0–30d" | "31–90d" | "90d+";
export function renewalAgingTag(daysOverdue: number): RenewalAging {
  if (daysOverdue <= 30) return "0–30d";
  if (daysOverdue <= 90) return "31–90d";
  return "90d+";
}

// Aging bucket for an INVOICE (spec §2.4: Current / 1–30 / 31–60 / 60+). Current
// = not yet overdue; the rest bucket by days past due.
export type InvoiceAging = "Current" | "1–30" | "31–60" | "60+";
export function invoiceAgingBucket(daysOverdue: number): InvoiceAging {
  if (daysOverdue <= 0) return "Current";
  if (daysOverdue <= 30) return "1–30";
  if (daysOverdue <= 60) return "31–60";
  return "60+";
}

// A period is "below expected" (surfaced on the dashboard) when its deviation is
// at least the configured alert threshold below expected. Needs a real target.
export function isUsageBelowExpected(
  actualPerWeek: number,
  expectedPerWeek: number | null | undefined,
): boolean {
  if (!expectedPerWeek || expectedPerWeek <= 0) return false;
  return deviationPercent(actualPerWeek, expectedPerWeek) <= USAGE_DEVIATION_ALERT_PCT;
}

// An implementation project is "at risk" when it is under way and either past
// its target go-live, or its current stage has been open ≥ STAGE_STALL_DAYS
// (spec §2.2). Pure so the rule is testable in isolation.
export function isProjectAtRisk(args: {
  overallStatus: string;
  targetGoLive: string | null;
  daysInCurrentStage: number | null;
  today: string;
}): boolean {
  if (args.overallStatus !== "in_progress") return false;
  if (args.targetGoLive && args.targetGoLive < args.today) return true;
  if (args.daysInCurrentStage !== null && args.daysInCurrentStage >= STAGE_STALL_DAYS)
    return true;
  return false;
}

// ---------------------------------------------------------------------------
// Filter model. Customer + product-line scope the queries; time range only
// governs the "upcoming" horizon for the renewal/invoice pipeline lists. When
// range is unset (the default dashboard view) each module keeps its owner-fixed
// window (renewals 60d, invoices 30d); picking a range overrides both.
// ---------------------------------------------------------------------------

export type TimeRange = "week" | "month" | "quarter" | "custom";

export type DashboardFilter = {
  range?: TimeRange | null;
  from?: string | null; // custom range start (YYYY-MM-DD)
  to?: string | null; // custom range end (YYYY-MM-DD)
  customerId?: string | null; // organization id
  moduleId?: string | null; // product line (modules catalog id)
};

// Parse a URLSearchParams-shaped object into a DashboardFilter. Server-safe
// (no client deps) so every page — dashboard + module pages — reads params the
// same way.
export function parseFilterParams(sp: {
  range?: string;
  customer?: string;
  module?: string;
}): DashboardFilter {
  const range =
    sp.range === "week" || sp.range === "quarter" || sp.range === "custom" || sp.range === "month"
      ? (sp.range as TimeRange)
      : null;
  return {
    range,
    customerId: sp.customer || null,
    moduleId: sp.module || null,
  };
}

// Upcoming horizon (days from today) a module should use given the filter.
// `moduleDefault` is the owner-fixed window used when no range is selected.
function upcomingHorizonDays(
  filter: DashboardFilter,
  moduleDefault: number,
  today: string,
): number {
  switch (filter.range) {
    case "week":
      return 7;
    case "month":
      return 30;
    case "quarter":
      return 90;
    case "custom": {
      const d = diffDays(today, filter.to);
      return d && d > 0 ? d : moduleDefault;
    }
    default:
      return moduleDefault;
  }
}

// ---------------------------------------------------------------------------
// Returned shapes.
// ---------------------------------------------------------------------------

export type RenewalRow = {
  id: string;
  siteId: string | null; // anchor/first covered site → row links to its 360
  customer: string;
  amountPaise: number | null;
  renewalDate: string | null;
  daysUntil: number | null; // negative = overdue
  overdue: boolean;
  aging: RenewalAging | null; // only for overdue
};

export type InvoiceRow = {
  id: string;
  siteId: string | null;
  customer: string;
  invoiceNumber: string;
  balancePaise: number;
  dueDate: string | null;
  daysOverdue: number; // ≤0 when not yet due
  overdue: boolean;
  aging: InvoiceAging;
};

export type ImplementationRow = {
  id: string;
  siteId: string;
  customer: string;
  projectName: string;
  overallStatus: string;
  atRisk: boolean;
  currentStage: number; // 1..5
  daysInStage: number | null;
  targetGoLive: string | null;
  daysOverGoLive: number | null; // positive when past target
};

export type UsageRow = {
  siteId: string;
  customer: string;
  moduleName: string;
  actualPerWeek: number;
  expectedPerWeek: number;
  deviationPct: number; // negative = below expected
  belowExpected: boolean;
  trend: number[]; // last ≤4 weeks of actual counts, oldest → newest
};

export type DashboardData = {
  renewals: {
    overdueValuePaise: number;
    overdueCount: number;
    upcomingValuePaise: number;
    upcomingCount: number;
    rows: RenewalRow[]; // overdue first (₹ desc), then upcoming (soonest)
  };
  invoices: {
    overdueValuePaise: number;
    overdueCount: number;
    dueSoonValuePaise: number;
    rows: InvoiceRow[]; // overdue first (₹ desc), then due-soon (oldest due)
  };
  implementation: {
    activeCount: number;
    atRiskCount: number;
    rows: ImplementationRow[]; // at-risk only, most over target go-live first
  };
  usage: {
    belowExpectedCount: number;
    rows: UsageRow[]; // worst deviation first
  };
};

// Loosely-typed client, matching lib/org-list-metrics.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

// Filter-bar options shared by the dashboard + every module page: customers
// (organizations) and product lines (the modules catalog, data-driven).
export async function getFilterOptions(supabase: Db): Promise<{
  customers: { id: string; name: string }[];
  products: { id: string; name: string }[];
}> {
  const [orgsRes, modulesRes] = await Promise.all([
    supabase.from("organizations").select("id, brand_name, legal_name").order("legal_name"),
    supabase.from("modules").select("id, name").eq("active", true).order("name"),
  ]);
  return {
    customers: (orgsRes.data ?? []).map((o) => ({
      id: o.id,
      name: o.brand_name || o.legal_name || "—",
    })),
    products: modulesRes.data ?? [],
  };
}

function flatten<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ---------------------------------------------------------------------------
// The one batched loader. Pulls every table the four modules need in parallel,
// then computes each module's KPIs + sorted list in memory.
// ---------------------------------------------------------------------------

// Options that widen the loader for the full module pages. On the dashboard
// they're all off: panels show only what needs attention today (overdue +
// each module's upcoming window, at-risk implementations, below-expected usage).
// The module pages set them so "View all" shows the complete list.
export type DashboardOptions = {
  horizonDays?: number; // override the renewal/invoice upcoming window (days)
  allImplementations?: boolean; // include healthy/every project, not just at-risk
  allUsage?: boolean; // include every tracked customer, not just below-expected
};

export async function getDashboardData(
  supabase: Db,
  filter: DashboardFilter = {},
  opts: DashboardOptions = {},
): Promise<DashboardData> {
  const today = todayIso();

  const [
    orgsRes,
    sitesRes,
    poSitesRes,
    poModulesRes,
    renewalsRes,
    projectsRes,
    invoicesRes,
    balancesRes,
    usageRes,
    expectationsRes,
    modulesRes,
  ] = await Promise.all([
    supabase.from("organizations").select("id, brand_name, legal_name"),
    supabase.from("sites").select("id, name, organization_id, go_live_date"),
    supabase.from("po_sites").select("po_id, site_id"),
    supabase.from("po_modules").select("po_id, module_id"),
    supabase
      .from("renewals")
      .select(
        "id, po_id, organization_id, anchor_site_id, offset_months, status, renewal_date_override, expected_value_paise",
      ),
    supabase
      .from("implementation_projects")
      .select(
        "id, org_id, site_id, project_name, overall_status, po_id, stages:implementation_project_stages(stage_number, stage_status, data, updated_at)",
      ),
    supabase
      .from("invoices")
      .select(
        "id, po_id, billed_site_id, invoice_number, total_paise, due_date, status, billed_site:sites!billed_site_id(organization_id)",
      ),
    supabase
      .from("invoice_balances")
      .select("invoice_id, balance_paise, computed_status"),
    supabase
      .from("usage_entries")
      .select("site_id, module_id, year, month, week, entry_count"),
    supabase
      .from("usage_expectations")
      .select("site_id, module_id, expected_per_week"),
    supabase.from("modules").select("id, name"),
  ]);

  // --- Lookups shared across modules ---------------------------------------
  const orgName = new Map<string, string>();
  for (const o of orgsRes.data ?? []) {
    orgName.set(o.id, o.brand_name || o.legal_name || "—");
  }
  const moduleName = new Map<string, string>();
  for (const m of modulesRes.data ?? []) moduleName.set(m.id, m.name);

  const site = new Map<string, { name: string; orgId: string; goLive: string | null }>();
  for (const s of sitesRes.data ?? []) {
    site.set(s.id, { name: s.name, orgId: s.organization_id, goLive: s.go_live_date });
  }

  // POs that cover the filtered module (product-line filter). Null = no filter.
  const poHasModule = new Map<string, Set<string>>();
  for (const pm of poModulesRes.data ?? []) {
    let set = poHasModule.get(pm.po_id);
    if (!set) {
      set = new Set();
      poHasModule.set(pm.po_id, set);
    }
    set.add(pm.module_id);
  }
  const poMatchesModule = (poId: string | null): boolean => {
    if (!filter.moduleId) return true;
    if (!poId) return false;
    return poHasModule.get(poId)?.has(filter.moduleId) ?? false;
  };

  // Per-PO go-live anchor: the linked project's Stage-4 go-live, else the
  // earliest go-live among covered sites (mirrors org-list-metrics.ts).
  const poGoLive = new Map<string, string>();
  const poFirstSite = new Map<string, string>(); // for row links when no anchor site
  for (const p of projectsRes.data ?? []) {
    if (p.po_id) {
      const stage4 = (p.stages ?? []).find(
        (s: { stage_number: number }) => s.stage_number === 4,
      );
      const gl = (stage4?.data as { goLiveDate?: string } | null)?.goLiveDate;
      if (gl && !poGoLive.has(p.po_id)) poGoLive.set(p.po_id, gl);
    }
  }
  for (const link of poSitesRes.data ?? []) {
    if (!poFirstSite.has(link.po_id)) poFirstSite.set(link.po_id, link.site_id);
    const gl = site.get(link.site_id)?.goLive;
    if (!gl) continue;
    const existing = poGoLive.get(link.po_id);
    if (!existing || gl < existing) poGoLive.set(link.po_id, gl);
  }

  const matchesCustomer = (orgId: string | null | undefined): boolean =>
    !filter.customerId || orgId === filter.customerId;

  // ------------------------------------------------------------------ Renewals
  const renewalHorizon =
    opts.horizonDays ?? upcomingHorizonDays(filter, RENEWAL_UPCOMING_DAYS, today);
  const renewalRows: RenewalRow[] = [];
  let rOverdueValue = 0,
    rOverdueCount = 0,
    rUpcomingValue = 0,
    rUpcomingCount = 0;

  for (const r of renewalsRes.data ?? []) {
    if (r.status !== "upcoming") continue;
    if (!matchesCustomer(r.organization_id)) continue;
    if (!poMatchesModule(r.po_id)) continue;

    const anchor = poGoLive.get(r.po_id) ?? site.get(r.anchor_site_id ?? "")?.goLive ?? null;
    const effective = r.renewal_date_override ?? renewalDate(anchor, r.offset_months);
    if (!effective) continue;

    const days = diffDays(today, effective); // negative = overdue
    const overdue = days !== null && days < 0;
    const upcoming = days !== null && days >= 0 && days <= renewalHorizon;
    if (!overdue && !upcoming) continue;

    const amount = r.expected_value_paise ?? null;
    if (overdue) {
      rOverdueValue += amount ?? 0;
      rOverdueCount += 1;
    } else {
      rUpcomingValue += amount ?? 0;
      rUpcomingCount += 1;
    }

    renewalRows.push({
      id: r.id,
      siteId: r.anchor_site_id ?? poFirstSite.get(r.po_id) ?? null,
      customer: orgName.get(r.organization_id) ?? "—",
      amountPaise: amount,
      renewalDate: effective,
      daysUntil: days,
      overdue,
      aging: overdue && days !== null ? renewalAgingTag(-days) : null,
    });
  }
  // Overdue first, by ₹ desc then days-overdue; upcoming below, soonest first.
  renewalRows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.overdue) {
      if ((b.amountPaise ?? 0) !== (a.amountPaise ?? 0))
        return (b.amountPaise ?? 0) - (a.amountPaise ?? 0);
      return (a.daysUntil ?? 0) - (b.daysUntil ?? 0); // more overdue (more negative) first
    }
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0); // soonest first
  });

  // ------------------------------------------------------------------ Invoices
  const invoiceHorizon =
    opts.horizonDays ?? upcomingHorizonDays(filter, INVOICE_UPCOMING_DAYS, today);
  const balance = new Map<string, { balancePaise: number; status: string }>();
  for (const b of balancesRes.data ?? []) {
    balance.set(b.invoice_id, {
      balancePaise: Number(b.balance_paise),
      status: b.computed_status,
    });
  }
  const invoiceRows: InvoiceRow[] = [];
  let iOverdueValue = 0,
    iOverdueCount = 0,
    iDueSoonValue = 0;

  for (const inv of invoicesRes.data ?? []) {
    const billedSite = flatten(inv.billed_site) as { organization_id?: string } | null;
    const orgId = billedSite?.organization_id;
    if (!matchesCustomer(orgId)) continue;
    if (!poMatchesModule(inv.po_id)) continue;
    if (inv.status === "cancelled" || inv.status === "draft") continue;

    const bal = balance.get(inv.id);
    const balancePaise = bal?.balancePaise ?? Number(inv.total_paise);
    if (balancePaise <= 0) continue; // fully collected

    const days = diffDays(today, inv.due_date); // negative = past due
    const daysOverdue = days === null ? 0 : -days;
    const overdue = daysOverdue > 0;
    const dueSoon = !overdue && days !== null && days <= invoiceHorizon;
    if (!overdue && !dueSoon) continue;

    if (overdue) {
      iOverdueValue += balancePaise;
      iOverdueCount += 1;
    } else {
      iDueSoonValue += balancePaise;
    }

    invoiceRows.push({
      id: inv.id,
      siteId: inv.billed_site_id ?? null,
      customer: orgName.get(orgId ?? "") ?? "—",
      invoiceNumber: inv.invoice_number,
      balancePaise,
      dueDate: inv.due_date,
      daysOverdue,
      overdue,
      aging: invoiceAgingBucket(daysOverdue),
    });
  }
  invoiceRows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.overdue) {
      if (b.balancePaise !== a.balancePaise) return b.balancePaise - a.balancePaise;
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? ""); // oldest due first
    }
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  });

  // ------------------------------------------------------------ Implementation
  const implRows: ImplementationRow[] = [];
  let activeCount = 0;
  for (const p of projectsRes.data ?? []) {
    if (!matchesCustomer(p.org_id)) continue;
    if (filter.moduleId && !poMatchesModule(p.po_id)) continue;
    if (p.overall_status === "in_progress") activeCount += 1;

    // Skip placeholder/incomplete rows (spec anti-pattern: no "Unnamed Project").
    const name = (p.project_name ?? "").trim();
    if (!name || /^unnamed/i.test(name)) continue;

    const stages = (p.stages ?? []) as {
      stage_number: number;
      stage_status: string;
      data: unknown;
      updated_at: string;
    }[];
    // Current stage = the in-progress stage with the greatest number; if none is
    // in progress, the first stage that isn't complete.
    const inProgress = stages
      .filter((s) => s.stage_status === "in_progress")
      .sort((a, b) => b.stage_number - a.stage_number);
    const current =
      inProgress[0] ??
      stages.filter((s) => s.stage_status !== "complete").sort((a, b) => a.stage_number - b.stage_number)[0] ??
      stages.sort((a, b) => b.stage_number - a.stage_number)[0];
    const currentStage = current?.stage_number ?? 1;
    const daysInStage = current?.updated_at
      ? diffDays(current.updated_at.slice(0, 10), today)
      : null;

    const stage4 = stages.find((s) => s.stage_number === 4);
    const targetGoLive =
      (stage4?.data as { goLiveDate?: string } | null)?.goLiveDate ?? null;

    const atRisk = isProjectAtRisk({
      overallStatus: p.overall_status,
      targetGoLive,
      daysInCurrentStage: daysInStage,
      today,
    });
    // Dashboard shows at-risk only; the module page (allImplementations) shows all.
    if (!atRisk && !opts.allImplementations) continue;

    const daysOver = targetGoLive ? diffDays(targetGoLive, today) : null;
    implRows.push({
      id: p.id,
      siteId: p.site_id,
      customer: orgName.get(p.org_id) ?? site.get(p.site_id)?.name ?? "—",
      projectName: name,
      overallStatus: p.overall_status,
      atRisk,
      currentStage,
      daysInStage,
      targetGoLive,
      daysOverGoLive: daysOver,
    });
  }
  // At-risk first, then most overdue against target go-live, then longest stalled.
  implRows.sort(
    (a, b) =>
      Number(b.atRisk) - Number(a.atRisk) ||
      (b.daysOverGoLive ?? -Infinity) - (a.daysOverGoLive ?? -Infinity) ||
      (b.daysInStage ?? 0) - (a.daysInStage ?? 0),
  );

  // ---------------------------------------------------------------------- Usage
  // Latest week + last-4-weeks trend per (site, module). Sum entry_count across
  // entry sources for each period. periodKey is monotonic within/ across years.
  const periodKey = (y: number, m: number, w: number) => y * 1000 + m * 10 + w;
  const usageBySiteModule = new Map<string, Map<number, number>>(); // key → period → count
  for (const e of usageRes.data ?? []) {
    const key = `${e.site_id}|${e.module_id}`;
    let periods = usageBySiteModule.get(key);
    if (!periods) {
      periods = new Map();
      usageBySiteModule.set(key, periods);
    }
    const pk = periodKey(e.year, e.month, e.week);
    periods.set(pk, (periods.get(pk) ?? 0) + Number(e.entry_count));
  }
  const expected = new Map<string, number>();
  for (const x of expectationsRes.data ?? []) {
    expected.set(`${x.site_id}|${x.module_id}`, Number(x.expected_per_week));
  }

  const usageRows: UsageRow[] = [];
  for (const [key, periods] of usageBySiteModule) {
    const [siteId, moduleId] = key.split("|");
    const s = site.get(siteId);
    if (!matchesCustomer(s?.orgId)) continue;
    if (filter.moduleId && moduleId !== filter.moduleId) continue;

    const exp = expected.get(key);
    if (!exp || exp <= 0) continue; // no target → Unknown, not an alert

    const sortedPeriods = [...periods.keys()].sort((a, b) => a - b);
    const latest = sortedPeriods[sortedPeriods.length - 1];
    const actual = periods.get(latest) ?? 0;
    const belowExpected = isUsageBelowExpected(actual, exp);
    // Dashboard shows below-expected only; the module page (allUsage) shows all.
    if (!belowExpected && !opts.allUsage) continue;

    const trend = sortedPeriods.slice(-4).map((pk) => periods.get(pk) ?? 0);
    usageRows.push({
      siteId,
      customer: s?.name ?? "—",
      moduleName: moduleName.get(moduleId) ?? "—",
      actualPerWeek: actual,
      expectedPerWeek: exp,
      deviationPct: deviationPercent(actual, exp),
      belowExpected,
      trend,
    });
  }
  usageRows.sort((a, b) => a.deviationPct - b.deviationPct); // worst (most negative) first

  return {
    renewals: {
      overdueValuePaise: rOverdueValue,
      overdueCount: rOverdueCount,
      upcomingValuePaise: rUpcomingValue,
      upcomingCount: rUpcomingCount,
      rows: renewalRows,
    },
    invoices: {
      overdueValuePaise: iOverdueValue,
      overdueCount: iOverdueCount,
      dueSoonValuePaise: iDueSoonValue,
      rows: invoiceRows,
    },
    implementation: {
      activeCount,
      atRiskCount: implRows.filter((r) => r.atRisk).length,
      rows: implRows,
    },
    usage: {
      belowExpectedCount: usageRows.filter((r) => r.belowExpected).length,
      rows: usageRows,
    },
  };
}
