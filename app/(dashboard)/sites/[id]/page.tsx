import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";

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
         id, po_number, po_received_date,
         po_type:po_types ( name )
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

  const poTotalsById = new Map(
    (poTotals || []).map((row) => [row.po_id, row.po_value_paise]),
  );

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, amount_paise, gst_amount_paise, total_paise,
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

  const { data: payments } = invoiceIds.length
    ? await supabase
        .from("payments")
        .select("id, invoice_id, amount_paise, received_date, mode, reference")
        .in("invoice_id", invoiceIds)
        .order("received_date", { ascending: false })
    : { data: [] };

  const organization = Array.isArray(site.organization)
    ? site.organization[0]
    : site.organization;
  const onboardingOwner = Array.isArray(site.onboarding_owner)
    ? site.onboarding_owner[0]
    : site.onboarding_owner;
  const csOwner = Array.isArray(site.cs_owner)
    ? site.cs_owner[0]
    : site.cs_owner;

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

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-slate-500">
        Purchase orders
      </h2>
      {purchaseOrders.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No purchase orders recorded for this site yet.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">PO number</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Received</th>
                <th className="px-4 py-2 text-right font-medium">
                  Total (computed)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchaseOrders.map((po) => {
                const poType = Array.isArray(po.po_type)
                  ? po.po_type[0]
                  : po.po_type;
                return (
                  <tr key={po.id}>
                    <td className="px-4 py-2 text-slate-900">
                      {po.po_number}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {poType?.name || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {po.po_received_date || "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-900">
                      {formatPaise(poTotalsById.get(po.id) ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-slate-500">
        Invoices
      </h2>
      {!invoices || invoices.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No invoices raised to this site yet.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Invoice</th>
                <th className="px-4 py-2 text-left font-medium">PO</th>
                <th className="px-4 py-2 text-left font-medium">Issued</th>
                <th className="px-4 py-2 text-left font-medium">Due</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 text-right font-medium">GST</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const po = Array.isArray(inv.purchase_order)
                  ? inv.purchase_order[0]
                  : inv.purchase_order;
                const balance = balancesByInvoice.get(inv.id);
                const status = balance?.computed_status || inv.status;
                const isOverdue = status === "overdue";
                return (
                  <tr
                    key={inv.id}
                    className={isOverdue ? "bg-red-50/40" : undefined}
                  >
                    <td className="px-4 py-2 text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {po?.po_number || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {inv.issue_date || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {inv.due_date || "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {formatPaise(inv.amount_paise)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {formatPaise(inv.gst_amount_paise)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-900">
                      {formatPaise(inv.total_paise)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      {formatPaise(balance?.balance_paise ?? inv.total_paise)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-slate-500">
        Payments received
      </h2>
      {!payments || payments.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No payments recorded against this site&apos;s invoices yet.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Invoice</th>
                <th className="px-4 py-2 text-left font-medium">Received</th>
                <th className="px-4 py-2 text-left font-medium">Mode</th>
                <th className="px-4 py-2 text-left font-medium">Reference</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => {
                const invoice = invoices?.find((i) => i.id === p.invoice_id);
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-slate-900">
                      {invoice?.invoice_number || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {p.received_date}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {p.mode || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {p.reference || "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      {formatPaise(p.amount_paise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
