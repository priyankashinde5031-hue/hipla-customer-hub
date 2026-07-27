import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { formatPaise } from "@/lib/currency";
import { AddSiteButton } from "./site-form";

const STATUS_STYLES: Record<string, string> = {
  live: "bg-green-50 text-green-700",
  implementing: "bg-amber-50 text-amber-700",
  prospect: "bg-amber-50 text-amber-700",
  suspended: "bg-amber-50 text-amber-700",
  churned: "bg-red-50 text-red-700",
};

// Org-level money card. Mirrors the Site 360's SummaryCard: value={null} shows
// emptyText in muted grey (money that is ₹0 only because nothing exists yet),
// and tone tints the border + value (green = fully collected, red = money owed).
function SummaryCard({
  label,
  value,
  context,
  emptyText,
  tone = "default",
}: {
  label: string;
  value: string | null;
  context?: string | null;
  emptyText?: string;
  tone?: "default" | "red" | "green";
}) {
  const isEmpty = value === null;
  const borderClass =
    isEmpty || tone === "default"
      ? "border-gray-200"
      : tone === "red"
        ? "border-red-200"
        : "border-emerald-200";
  const valueClass = isEmpty
    ? "text-slate-400"
    : tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-700"
        : "text-gray-900";
  return (
    <div className={`rounded-xl border ${borderClass} bg-white p-3 shadow-sm`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>
        {isEmpty ? emptyText ?? "—" : value}
      </p>
      {!isEmpty && context ? (
        <p className="mt-0.5 text-xs text-slate-500">{context}</p>
      ) : null}
    </div>
  );
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, legal_name, brand_name, industry, status, notes")
    .eq("id", id)
    .maybeSingle();

  if (!organization) {
    notFound();
  }

  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("id, name, is_hq, status, region")
    .eq("organization_id", id)
    .order("is_hq", { ascending: false })
    .order("name");

  // Organization = Site collapse (spec §5.1: almost everything hangs off the
  // Site). A single-site org has no separate "sites" step — jump straight
  // into that Site's 360 rather than showing a one-row list.
  if (sites && sites.length === 1) {
    redirect(`/sites/${sites[0].id}`);
  }

  const [user, { data: owners }] = await Promise.all([
    getCurrentInternalUser(),
    supabase.from("internal_users").select("id, name").eq("is_active", true).order("name"),
  ]);
  const canEdit = canEditCatalogs(user);

  // Commercial rollup across ALL of this org's sites (spec §6 money metrics,
  // same rules as the Site 360 — every figure derived on read, never
  // hand-totaled). POs are org-owned, so we sum each PO exactly once by
  // organization_id (a PO covering several sites is NOT double-counted).
  // Invoices/payments are per-site, so we sum them across the org's sites.
  const siteIds = (sites ?? []).map((s) => s.id);

  const { data: orgPos } = await supabase
    .from("purchase_orders")
    .select("id, gst_percent")
    .eq("organization_id", id);
  const orgPoIds = (orgPos ?? []).map((po) => po.id);

  const { data: orgPoTotals } = orgPoIds.length
    ? await supabase.from("po_totals").select("po_id, po_value_paise").in("po_id", orgPoIds)
    : { data: [] };
  const orgPoNetById = new Map(
    (orgPoTotals ?? []).map((row) => [row.po_id, row.po_value_paise]),
  );

  // PO value shown = goods (line-item sum) + GST %, GST derived here (not stored).
  const totalPoValuePaise = (orgPos ?? []).reduce((sum, po) => {
    const net = orgPoNetById.get(po.id) ?? 0;
    const pct = po.gst_percent ?? 0;
    const gst = pct > 0 ? Math.round((net * pct) / 100) : 0;
    return sum + net + gst;
  }, 0);

  const { data: orgInvoices } = siteIds.length
    ? await supabase
        .from("invoices")
        .select("id, total_paise")
        .in("billed_site_id", siteIds)
    : { data: [] };
  const orgInvoiceIds = (orgInvoices ?? []).map((inv) => inv.id);

  const { data: orgBalances } = orgInvoiceIds.length
    ? await supabase
        .from("invoice_balances")
        .select("invoice_id, paid_paise, balance_paise, computed_status")
        .in("invoice_id", orgInvoiceIds)
    : { data: [] };
  const orgBalanceByInvoice = new Map(
    (orgBalances ?? []).map((row) => [row.invoice_id, row]),
  );

  // Cancelled invoices don't count as invoiced or pending (matches Site 360).
  const totalInvoicedPaise = (orgInvoices ?? []).reduce((sum, inv) => {
    const cs = orgBalanceByInvoice.get(inv.id)?.computed_status;
    return cs === "cancelled" ? sum : sum + inv.total_paise;
  }, 0);
  const totalCollectedPaise = (orgBalances ?? []).reduce(
    (sum, b) => sum + b.paid_paise,
    0,
  );
  const outstandingPaise = (orgBalances ?? []).reduce(
    (sum, b) =>
      ["due", "overdue", "part-paid"].includes(b.computed_status)
        ? sum + b.balance_paise
        : sum,
    0,
  );

  const activeInvoiceCount = (orgInvoices ?? []).filter(
    (inv) => orgBalanceByInvoice.get(inv.id)?.computed_status !== "cancelled",
  ).length;
  const hasInvoices = activeInvoiceCount > 0;
  const overdueCount = (orgBalances ?? []).filter(
    (b) => b.computed_status === "overdue",
  ).length;
  const collectedPct =
    totalInvoicedPaise > 0
      ? Math.round((totalCollectedPaise / totalInvoicedPaise) * 100)
      : 0;
  const fullyCollected = hasInvoices && outstandingPaise === 0;
  const poCount = orgPoIds.length;
  const siteCount = siteIds.length;

  return (
    <div>
      <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
        {organization.brand_name || organization.legal_name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {organization.legal_name}
        {organization.industry ? ` · ${organization.industry}` : ""}
      </p>

      {/* Commercial rollup — the whole customer's money at a glance, summed
          across every site below (spec §6). */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard
          label="Purchase orders"
          value={String(poCount)}
          context={
            siteCount > 0
              ? `Across ${siteCount} site${siteCount === 1 ? "" : "s"}`
              : null
          }
        />
        <SummaryCard
          label="Total PO value"
          value={poCount > 0 ? formatPaise(totalPoValuePaise) : null}
          emptyText="No POs yet"
        />
        <SummaryCard
          label="Total invoiced"
          value={hasInvoices ? formatPaise(totalInvoicedPaise) : null}
          emptyText="No invoices yet"
          context={
            hasInvoices
              ? `${activeInvoiceCount} invoice${activeInvoiceCount === 1 ? "" : "s"}`
              : null
          }
        />
        <SummaryCard
          label="Total collected"
          value={hasInvoices ? formatPaise(totalCollectedPaise) : null}
          emptyText="No invoices yet"
          context={hasInvoices ? `Collected ${collectedPct}% of invoiced` : null}
          tone={fullyCollected ? "green" : "default"}
        />
        <SummaryCard
          label="Outstanding"
          value={hasInvoices ? formatPaise(outstandingPaise) : null}
          emptyText="No invoices yet"
          context={
            !hasInvoices
              ? null
              : outstandingPaise > 0
                ? overdueCount > 0
                  ? `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} overdue`
                  : "Payment pending"
                : "Fully collected"
          }
          tone={outstandingPaise > 0 ? "red" : fullyCollected ? "green" : "default"}
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-serif font-semibold text-gray-900">
          Sites
        </h2>
        {canEdit && (
          <AddSiteButton
            organizationId={id}
            suggestHq={(sites?.length ?? 0) === 0}
            ownerOptions={owners ?? []}
          />
        )}
      </div>

      {sitesError && (
        <p className="mt-2 text-sm text-red-600">
          Could not load sites: {sitesError.message}
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sites?.map((site) => (
              <tr key={site.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/sites/${site.id}`}
                    className="rounded font-medium text-gray-900 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
                  >
                    {site.name}
                  </Link>
                  {site.is_hq && (
                    <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      HQ
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {site.region || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      STATUS_STYLES[site.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {site.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sites?.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            No sites yet for this organization.
          </p>
        )}
      </div>
    </div>
  );
}
