import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { AddPoButton, EditPoButton, type ExistingPo } from "./po-form";

const STATUS_STYLES: Record<string, string> = {
  cleared: "bg-emerald-50 text-emerald-700",
  "part-paid": "bg-amber-50 text-amber-700",
  due: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
  draft: "bg-slate-100 text-slate-600",
  raised: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "amber" ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AddressBlock({
  label,
  address,
}: {
  label: string;
  address: Record<string, unknown> | null;
}) {
  const hasContent = address && Object.keys(address).length > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </h3>
      {hasContent ? (
        <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
          {JSON.stringify(address, null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Not recorded yet.</p>
      )}
    </div>
  );
}

export default async function SitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select(
      `id, name, is_hq, status, region, timezone, gst_number, go_live_date,
       address_site, address_billing, address_shipping,
       organization:organizations ( id, legal_name, brand_name ),
       onboarding_owner:internal_users!sites_onboarding_owner_id_fkey ( name, email ),
       cs_owner:internal_users!sites_cs_owner_id_fkey ( name, email )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: poLinks } = await supabase
    .from("po_sites")
    .select(
      `purchase_order:purchase_orders (
         id, po_number, name, po_received_date,
         po_type_id, cost_type_id, financial_year, gst_percent, payment_terms,
         po_type:po_types ( name ),
         cost_type:cost_types ( name ),
         po_sites ( site_id ),
         po_modules ( module_id, module:modules ( name ) ),
         po_line_items ( id, description, qty, unit_price_paise, amount_paise )
       )`,
    )
    .eq("site_id", id);

  const purchaseOrders = (poLinks || [])
    .map((link) =>
      Array.isArray(link.purchase_order)
        ? link.purchase_order[0]
        : link.purchase_order,
    )
    .filter((po): po is NonNullable<typeof po> => Boolean(po));

  const poIds = purchaseOrders.map((po) => po.id);

  const { data: poTotals } = poIds.length
    ? await supabase.from("po_totals").select("po_id, po_value_paise").in("po_id", poIds)
    : { data: [] };

  const poNetById = new Map(
    (poTotals || []).map((row) => [row.po_id, row.po_value_paise]),
  );

  // PO total shown to users = goods (sum of line items) + GST. GST is a
  // percentage on the PO; the amount is derived here, never stored
  // (CLAUDE.md: money is computed, never hand-totaled).
  const poGrossById = new Map<string, number>(
    purchaseOrders.map((po) => {
      const net = poNetById.get(po.id) ?? 0;
      const pct = po.gst_percent ?? 0;
      const gst = pct > 0 ? Math.round((net * pct) / 100) : 0;
      return [po.id, net + gst];
    }),
  );

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, po_id, invoice_number, amount_paise, gst_amount_paise, total_paise,
       issue_date, due_date, status,
       purchase_order:purchase_orders ( po_number )`,
    )
    .eq("billed_site_id", id)
    .order("issue_date", { ascending: false });

  const invoiceIds = (invoices || []).map((inv) => inv.id);

  const { data: invoiceBalances } = invoiceIds.length
    ? await supabase
        .from("invoice_balances")
        .select("invoice_id, paid_paise, balance_paise, computed_status")
        .in("invoice_id", invoiceIds)
    : { data: [] };

  const balancesByInvoice = new Map(
    (invoiceBalances || []).map((row) => [row.invoice_id, row]),
  );

  const paymentsQuery = invoiceIds.length
    ? await supabase
        .from("payments")
        .select("id, invoice_id, amount_paise, received_date, mode, reference")
        .in("invoice_id", invoiceIds)
        .order("received_date", { ascending: false })
    : null;
  const payments = paymentsQuery?.data ?? [];

  const invoicesByPo = new Map<string, typeof invoices>();
  for (const inv of invoices || []) {
    if (!inv.po_id) continue;
    const list = invoicesByPo.get(inv.po_id) || [];
    list.push(inv);
    invoicesByPo.set(inv.po_id, list);
  }

  const paymentsByInvoice = new Map<string, NonNullable<typeof payments>>();
  for (const p of payments || []) {
    const list = paymentsByInvoice.get(p.invoice_id) || [];
    list.push(p);
    paymentsByInvoice.set(p.invoice_id, list);
  }

  // Aggregate cards — every figure derived on read, nothing hand-totaled (CLAUDE.md).
  const totalPoValuePaise = purchaseOrders.reduce(
    (sum, po) => sum + (poGrossById.get(po.id) ?? 0),
    0,
  );
  const totalInvoicedPaise = (invoices || []).reduce(
    (sum, inv) => sum + inv.total_paise,
    0,
  );
  const totalCollectedPaise = (invoiceBalances || []).reduce(
    (sum, b) => sum + b.paid_paise,
    0,
  );
  const outstandingPaise = (invoiceBalances || []).reduce(
    (sum, b) => sum + b.balance_paise,
    0,
  );

  const organization = Array.isArray(site.organization)
    ? site.organization[0]
    : site.organization;
  const onboardingOwner = Array.isArray(site.onboarding_owner)
    ? site.onboarding_owner[0]
    : site.onboarding_owner;
  const csOwner = Array.isArray(site.cs_owner)
    ? site.cs_owner[0]
    : site.cs_owner;

  // Who can add/edit POs, and the dropdown/multi-select options the form needs.
  // Catalogs are read active-only (CLAUDE.md: reference data is data; only
  // active items are selectable).
  const orgId = organization?.id;
  const [user, poTypesRes, costTypesRes, modulesRes, orgSitesRes] = await Promise.all([
    getCurrentInternalUser(),
    supabase.from("po_types").select("id, name").eq("active", true).order("name"),
    supabase.from("cost_types").select("id, name").eq("active", true).order("name"),
    supabase.from("modules").select("id, name").eq("active", true).order("name"),
    orgId
      ? supabase.from("sites").select("id, name").eq("organization_id", orgId).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const canEdit = canEditCatalogs(user);
  const poFormOptions = {
    organizationId: orgId ?? "",
    siteId: id,
    poTypeOptions: poTypesRes.data ?? [],
    costTypeOptions: costTypesRes.data ?? [],
    moduleOptions: modulesRes.data ?? [],
    siteOptions: orgSitesRes.data ?? [],
  };

  // Reshape each PO into the form's edit payload (ids + rupee-free raw paise).
  const existingPoById = new Map<string, ExistingPo>(
    purchaseOrders.map((po) => [
      po.id,
      {
        id: po.id,
        po_number: po.po_number,
        name: po.name ?? null,
        po_type_id: po.po_type_id ?? null,
        cost_type_id: po.cost_type_id ?? null,
        po_received_date: po.po_received_date ?? null,
        financial_year: po.financial_year ?? null,
        gst_percent: po.gst_percent ?? null,
        payment_terms: po.payment_terms ?? null,
        site_ids: (po.po_sites || []).map((s) => s.site_id),
        module_ids: (po.po_modules || []).map((m) => m.module_id),
        line_items: (po.po_line_items || []).map((li) => ({
          description: li.description,
          qty: li.qty,
          unit_price_paise: li.unit_price_paise,
        })),
      },
    ]),
  );

  return (
    <div>
      {organization && (
        <Link
          href={`/organizations/${organization.id}`}
          className="text-sm text-indigo-600"
        >
          ← {organization.brand_name || organization.legal_name}
        </Link>
      )}

      <div className="mt-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {site.name}
        </h1>
        {site.is_hq && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            HQ
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
          {site.status}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Region
          </dt>
          <dd className="mt-1 text-slate-900">{site.region || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Timezone
          </dt>
          <dd className="mt-1 text-slate-900">{site.timezone || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            GST number
          </dt>
          <dd className="mt-1 text-slate-900">{site.gst_number || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Go-live date
          </dt>
          <dd className="mt-1 text-slate-900">{site.go_live_date || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Onboarding owner
          </dt>
          <dd className="mt-1 text-slate-900">
            {onboardingOwner?.name || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            CS owner
          </dt>
          <dd className="mt-1 text-slate-900">{csOwner?.name || "—"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">
        Addresses
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AddressBlock label="Site / physical" address={site.address_site} />
        <AddressBlock label="Billing" address={site.address_billing} />
        <AddressBlock label="Shipping" address={site.address_shipping} />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          PO &amp; payments
        </h2>
        {canEdit && <AddPoButton {...poFormOptions} />}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Purchase orders" value={String(purchaseOrders.length)} />
        <SummaryCard label="Total PO value" value={formatPaise(totalPoValuePaise)} />
        <SummaryCard label="Total invoiced" value={formatPaise(totalInvoicedPaise)} />
        <SummaryCard label="Total collected" value={formatPaise(totalCollectedPaise)} />
        <SummaryCard
          label="Outstanding"
          value={formatPaise(outstandingPaise)}
          tone={outstandingPaise > 0 ? "amber" : "default"}
        />
      </div>

      {purchaseOrders.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No purchase orders recorded for this site yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {purchaseOrders.map((po) => {
            const poType = Array.isArray(po.po_type) ? po.po_type[0] : po.po_type;
            const costType = Array.isArray(po.cost_type)
              ? po.cost_type[0]
              : po.cost_type;
            const moduleNames = (po.po_modules || [])
              .map((pm) => {
                const mod = Array.isArray(pm.module) ? pm.module[0] : pm.module;
                return mod?.name;
              })
              .filter(Boolean)
              .join(", ");
            const poInvoices = invoicesByPo.get(po.id) || [];

            return (
              <details
                key={po.id}
                className="group overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-slate-900">{po.po_number}</span>
                    <span className="text-sm text-slate-500">{poType?.name || "—"}</span>
                    <span className="text-sm text-slate-500">{moduleNames || "—"}</span>
                    <span className="text-sm text-slate-500">{costType?.name || "—"}</span>
                    <span className="text-sm text-slate-500">
                      {po.po_received_date || "—"}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-medium tabular-nums text-slate-900">
                      {formatPaise(poGrossById.get(po.id) ?? 0)}
                    </span>
                    {canEdit && existingPoById.get(po.id) && (
                      <EditPoButton po={existingPoById.get(po.id)!} {...poFormOptions} />
                    )}
                  </span>
                </summary>

                <div className="border-t border-slate-100 px-4 py-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Line items
                  </h3>
                  {(po.po_line_items || []).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No line items recorded.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-1 text-left font-medium">Description</th>
                          <th className="py-1 text-right font-medium">Qty</th>
                          <th className="py-1 text-right font-medium">Unit price</th>
                          <th className="py-1 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(po.po_line_items || []).map((li) => (
                          <tr key={li.id}>
                            <td className="py-1 text-slate-700">{li.description}</td>
                            <td className="py-1 text-right tabular-nums text-slate-700">
                              {li.qty}
                            </td>
                            <td className="py-1 text-right tabular-nums text-slate-700">
                              {formatPaise(li.unit_price_paise)}
                            </td>
                            <td className="py-1 text-right tabular-nums text-slate-900">
                              {formatPaise(li.amount_paise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-xs uppercase tracking-wide text-slate-500">
                            Subtotal (goods)
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-600">
                            {formatPaise(poNetById.get(po.id) ?? 0)}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-xs uppercase tracking-wide text-slate-500">
                            GST{po.gst_percent ? ` (${po.gst_percent}%)` : ""}
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-600">
                            {formatPaise((poGrossById.get(po.id) ?? 0) - (poNetById.get(po.id) ?? 0))}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                            PO total
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums text-slate-900">
                            {formatPaise(poGrossById.get(po.id) ?? 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Invoices
                  </h3>
                  {poInvoices.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">
                      No invoices raised against this PO for this site yet.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {poInvoices.map((inv) => {
                        const balance = balancesByInvoice.get(inv.id);
                        const status = balance?.computed_status || inv.status;
                        const isOverdue = status === "overdue";
                        const invPayments = paymentsByInvoice.get(inv.id) || [];
                        return (
                          <div
                            key={inv.id}
                            className={`rounded-md border ${
                              isOverdue ? "border-red-200 bg-red-50/40" : "border-slate-100"
                            } p-3`}
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                <span className="font-medium text-slate-900">
                                  {inv.invoice_number}
                                </span>
                                <span className="text-slate-500">
                                  Issued {inv.issue_date || "—"}
                                </span>
                                <span className="text-slate-500">
                                  Due {inv.due_date || "—"}
                                </span>
                                <StatusBadge status={status} />
                              </div>
                              <div className="flex gap-4 text-sm tabular-nums">
                                <span className="text-slate-500">
                                  Amount {formatPaise(inv.amount_paise)}
                                </span>
                                <span className="text-slate-500">
                                  GST {formatPaise(inv.gst_amount_paise)}
                                </span>
                                <span className="font-medium text-slate-900">
                                  Total {formatPaise(inv.total_paise)}
                                </span>
                                <span className="font-medium text-slate-900">
                                  Balance{" "}
                                  {formatPaise(balance?.balance_paise ?? inv.total_paise)}
                                </span>
                              </div>
                            </div>

                            {invPayments.length > 0 && (
                              <table className="mt-2 w-full text-sm">
                                <thead className="text-xs uppercase tracking-wide text-slate-500">
                                  <tr>
                                    <th className="py-1 text-left font-medium">Received</th>
                                    <th className="py-1 text-left font-medium">Mode</th>
                                    <th className="py-1 text-left font-medium">Reference</th>
                                    <th className="py-1 text-right font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {invPayments.map((p) => (
                                    <tr key={p.id}>
                                      <td className="py-1 text-slate-700">{p.received_date}</td>
                                      <td className="py-1 text-slate-700">{p.mode || "—"}</td>
                                      <td className="py-1 text-slate-700">
                                        {p.reference || "—"}
                                      </td>
                                      <td className="py-1 text-right tabular-nums text-slate-900">
                                        {formatPaise(p.amount_paise)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
