// Portfolio metrics for the Organizations list. Every figure is computed on
// read from the underlying rows — nothing is stored (CLAUDE.md: money and
// derived figures are computed, never hand-totaled). Kept in one place so the
// list page stays a thin renderer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { renewalDate } from "@/lib/renewals";

export type OrgMetrics = {
  totalPos: number; // count of purchase orders owned by the org
  overdueRenewals: number; // upcoming renewals whose date has passed, this FY
  overdueInvoices: number; // invoices billed to the org's sites, now overdue
  projectsInProgress: number; // implementation projects still under way
};

// Today as YYYY-MM-DD in local time (matches how dates are stored/compared).
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Start of the current Indian financial year (Apr 1). Before April the FY began
// in the previous calendar year.
function currentFyStartIso(): string {
  const d = new Date();
  const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${fyStartYear}-04-01`;
}

function emptyMetrics(): OrgMetrics {
  return { totalPos: 0, overdueRenewals: 0, overdueInvoices: 0, projectsInProgress: 0 };
}

// Compute the four list metrics for every organization in one pass. Returns a
// map keyed by organization id; callers default missing orgs to zeroes.
export async function getOrganizationMetrics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<Map<string, OrgMetrics>> {
  const today = todayIso();
  const fyStart = currentFyStartIso();

  const [posRes, poSitesRes, sitesRes, renewalsRes, projectsRes, invoicesRes, paymentsRes] =
    await Promise.all([
      supabase.from("purchase_orders").select("id, organization_id"),
      supabase.from("po_sites").select("po_id, site_id"),
      supabase.from("sites").select("id, organization_id, go_live_date"),
      supabase
        .from("renewals")
        .select("po_id, organization_id, offset_months, status, renewal_date_override"),
      supabase
        .from("implementation_projects")
        .select("org_id, po_id, overall_status, stages:implementation_project_stages(stage_number, data)"),
      supabase
        .from("invoices")
        .select("id, po_id, due_date, status, total_paise, billed_site:sites!billed_site_id(organization_id)"),
      supabase.from("payments").select("invoice_id, amount_paise"),
    ]);

  const metrics = new Map<string, OrgMetrics>();
  const get = (orgId: string) => {
    let m = metrics.get(orgId);
    if (!m) {
      m = emptyMetrics();
      metrics.set(orgId, m);
    }
    return m;
  };

  // 1. Total POs.
  for (const po of posRes.data ?? []) {
    if (po.organization_id) get(po.organization_id).totalPos += 1;
  }

  // 4. Projects under implementation (overall_status = in_progress). Also build
  //    the per-PO go-live anchor used by the renewal dates below.
  const poGoLive = new Map<string, string>();
  for (const p of projectsRes.data ?? []) {
    if (p.overall_status === "in_progress" && p.org_id) {
      get(p.org_id).projectsInProgress += 1;
    }
    if (p.po_id) {
      const stage4 = (p.stages ?? []).find((s: { stage_number: number }) => s.stage_number === 4);
      const goLive = (stage4?.data as { goLiveDate?: string } | null)?.goLiveDate;
      if (goLive && !poGoLive.has(p.po_id)) poGoLive.set(p.po_id, goLive);
    }
  }

  // Fallback go-live per PO: the earliest go-live among its covered sites.
  const siteGoLive = new Map<string, string | null>();
  for (const s of sitesRes.data ?? []) siteGoLive.set(s.id, s.go_live_date);
  const poSiteGoLive = new Map<string, string>();
  for (const link of poSitesRes.data ?? []) {
    const gl = siteGoLive.get(link.site_id);
    if (!gl) continue;
    const existing = poSiteGoLive.get(link.po_id);
    if (!existing || gl < existing) poSiteGoLive.set(link.po_id, gl);
  }

  // 2. Overdue renewals this FY: upcoming renewals whose effective date landed
  //    within the current financial year and has already passed.
  for (const r of renewalsRes.data ?? []) {
    if (r.status !== "upcoming" || !r.organization_id) continue;
    const anchor = poGoLive.get(r.po_id) ?? poSiteGoLive.get(r.po_id) ?? null;
    const effective = r.renewal_date_override ?? renewalDate(anchor, r.offset_months);
    if (!effective) continue;
    if (effective >= fyStart && effective < today) {
      get(r.organization_id).overdueRenewals += 1;
    }
  }

  // 3. Overdue invoices: mirrors the invoice_balances view — not cancelled/draft,
  //    past due, and not fully paid. Resolve the org through the billed site.
  const paidByInvoice = new Map<string, number>();
  for (const p of paymentsRes.data ?? []) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount_paise));
  }
  for (const inv of invoicesRes.data ?? []) {
    const billedSite = Array.isArray(inv.billed_site) ? inv.billed_site[0] : inv.billed_site;
    const orgId = billedSite?.organization_id as string | undefined;
    if (!orgId) continue;
    if (inv.status === "cancelled" || inv.status === "draft") continue;
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const overdue = inv.due_date && inv.due_date < today && paid < Number(inv.total_paise);
    if (overdue) get(orgId).overdueInvoices += 1;
  }

  return metrics;
}
