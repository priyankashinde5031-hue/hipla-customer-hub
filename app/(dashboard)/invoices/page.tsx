import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { getDashboardData, getFilterOptions, parseFilterParams } from "@/lib/dashboard-metrics";
import { INVOICE_UPCOMING_DAYS } from "@/lib/dashboard-config";
import { ModuleHeader, StatusChip, chipHref } from "../_dashboard/module-header";
import { InvoiceAgingTag } from "../_dashboard/tags";

type SearchParams = Record<string, string | string[] | undefined>;

// Portfolio Invoices / Collections page — the "View all →" destination for Due
// Invoices. Shows every outstanding invoice (all sites), overdue first by ₹.
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { customers, products } = await getFilterOptions(supabase);

  const filter = parseFilterParams({
    range: typeof sp.range === "string" ? sp.range : undefined,
    customer: typeof sp.customer === "string" ? sp.customer : undefined,
    module: typeof sp.module === "string" ? sp.module : undefined,
  });
  // Wide horizon so "All" can list every outstanding invoice; the default
  // "Outstanding" view narrows to overdue + due within the next 30 days (owner ask).
  const data = await getDashboardData(supabase, filter, { horizonDays: 3650 });

  // daysOverdue > 0 = past due; ≤ 0 = not yet due (its magnitude = days until due).
  // "Due soon" = overdue OR due within the next 30 days.
  const isDueSoon = (inv: (typeof data.invoices.rows)[number]) =>
    inv.daysOverdue >= -INVOICE_UPCOMING_DAYS;

  const status = typeof sp.status === "string" ? sp.status : "outstanding";
  const rows = data.invoices.rows.filter((inv) =>
    status === "overdue" ? inv.overdue : status === "all" ? true : isDueSoon(inv),
  );
  const totalBalance = rows.reduce((s, r) => s + r.balancePaise, 0);

  const dueSoonCount = data.invoices.rows.filter(isDueSoon).length;

  const chips = (
    <>
      <StatusChip href={chipHref("/invoices", sp, "outstanding")} label={`Outstanding · 30d (${dueSoonCount})`} active={status === "outstanding"} />
      <StatusChip href={chipHref("/invoices", sp, "overdue")} label={`Overdue (${data.invoices.overdueCount})`} active={status === "overdue"} />
      <StatusChip href={chipHref("/invoices", sp, "all")} label={`All outstanding (${data.invoices.rows.length})`} active={status === "all"} />
    </>
  );

  return (
    <div>
      <ModuleHeader title="Invoices" basePath="/invoices" customers={customers} products={products} chips={chips} />

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No invoices match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Customer</th>
                <th className="px-4 py-2 text-left font-medium">Invoice #</th>
                <th className="px-4 py-2 text-left font-medium">Due date</th>
                <th className="px-4 py-2 text-left font-medium">Aging</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-gray-900">{inv.customer}</td>
                  <td className="px-4 py-2 text-slate-600">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {formatDate(inv.dueDate)}
                    {inv.overdue ? (
                      <span className="ml-2 text-xs font-medium text-red-600">{inv.daysOverdue}d overdue</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2"><InvoiceAgingTag aging={inv.aging} /></td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">
                    {formatPaise(inv.balancePaise)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {inv.siteId ? (
                      <Link href={`/sites/${inv.siteId}#pos`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                        Collect →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Total outstanding
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">
                  {formatPaise(totalBalance)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
