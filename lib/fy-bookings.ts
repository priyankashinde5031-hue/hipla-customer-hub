// "Booked value this financial year" for the dashboard: the total value of new
// POs received this FY, and the total of renewals recorded as "renewed" this FY.
//
// Deliberately self-contained — it depends on nothing but the commercial tables
// and the shared DashboardFilter, so it can ship on its own without the wider
// ARR/MRR business-health layer. Every figure is computed on read from the line
// items / renewal rows — nothing is stored (CLAUDE.md: money is computed, never
// hand-totaled). Currency is INR in paise (integers) throughout.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardFilter } from "./dashboard-metrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type FyBookings = {
  fyLabel: string; // e.g. "FY 2026–27"
  windowLabel: string; // e.g. "1 Apr 2026 – 31 Mar 2027"
  newOrderValuePaise: number;
  newOrderCount: number;
  renewalDoneValuePaise: number;
  renewalDoneCount: number;
};

// Today as YYYY-MM-DD in local time (matches how dates are stored/compared).
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// A day like "1 Apr 2026" for the window caption.
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The Indian financial year (April–March) that contains `iso`. Returns the
// half-open window [start, end) plus display labels. Exported for unit tests.
export function fyWindow(iso: string): {
  start: string;
  end: string;
  label: string;
  windowLabel: string;
} {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1; // FY starts in April
  const start = `${startYear}-04-01`;
  const end = `${startYear + 1}-04-01`; // exclusive upper bound
  return {
    start,
    end,
    label: `FY ${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`,
    windowLabel: `${fmtDay(start)} – ${fmtDay(`${startYear + 1}-03-31`)}`,
  };
}

export async function getFyBookings(
  supabase: Db,
  filter: DashboardFilter = {},
): Promise<FyBookings> {
  const fy = fyWindow(todayIso());

  const [posRes, lineItemsRes, poModulesRes, renewalsRes] = await Promise.all([
    supabase.from("purchase_orders").select("id, organization_id, po_received_date"),
    supabase.from("po_line_items").select("po_id, amount_paise"),
    supabase.from("po_modules").select("po_id, module_id"),
    supabase
      .from("renewals")
      .select("po_id, organization_id, status, renewal_value_paise, renewal_received_date"),
  ]);

  // PO → full line-item value (all lines).
  const poTotalPaise = new Map<string, number>();
  for (const li of lineItemsRes.data ?? []) {
    poTotalPaise.set(li.po_id, (poTotalPaise.get(li.po_id) ?? 0) + Number(li.amount_paise));
  }

  // PO → module set, for the product-line filter.
  const modulesByPo = new Map<string, Set<string>>();
  for (const pm of poModulesRes.data ?? []) {
    let set = modulesByPo.get(pm.po_id);
    if (!set) {
      set = new Set();
      modulesByPo.set(pm.po_id, set);
    }
    set.add(pm.module_id);
  }

  const matchesCustomer = (orgId: string | null | undefined) =>
    !filter.customerId || orgId === filter.customerId;
  const poMatchesModule = (poId: string) =>
    !filter.moduleId || (modulesByPo.get(poId)?.has(filter.moduleId) ?? false);

  // New orders: POs whose received date falls inside the FY window [start, end),
  // valued at their full line-item total. Renewals live on the renewals table
  // (not as new POs), so the two figures never overlap.
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

  return {
    fyLabel: fy.label,
    windowLabel: fy.windowLabel,
    newOrderValuePaise,
    newOrderCount,
    renewalDoneValuePaise,
    renewalDoneCount,
  };
}
