import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { getDashboardData, getFilterOptions, parseFilterParams } from "@/lib/dashboard-metrics";
import { ModuleHeader, StatusChip, chipHref } from "../_dashboard/module-header";
import { RenewalAgingTag } from "../_dashboard/tags";

type SearchParams = Record<string, string | string[] | undefined>;

// Portfolio Renewals page — the "View all →" destination for Pending Renewals.
// Shows every overdue + upcoming renewal (all sites), sorted by revenue impact.
export default async function RenewalsPage({
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
  // Wide horizon so the full page shows all future renewals, not just 60 days.
  const data = await getDashboardData(supabase, filter, { horizonDays: 3650 });

  const status = typeof sp.status === "string" ? sp.status : "all";
  const rows = data.renewals.rows.filter((r) =>
    status === "overdue" ? r.overdue : status === "upcoming" ? !r.overdue : true,
  );

  const chips = (
    <>
      <StatusChip href={chipHref("/renewals", sp, null)} label={`All (${data.renewals.rows.length})`} active={status === "all"} />
      <StatusChip href={chipHref("/renewals", sp, "overdue")} label={`Overdue (${data.renewals.overdueCount})`} active={status === "overdue"} />
      <StatusChip href={chipHref("/renewals", sp, "upcoming")} label={`Upcoming (${data.renewals.upcomingCount})`} active={status === "upcoming"} />
    </>
  );

  return (
    <div>
      <ModuleHeader title="Renewals" basePath="/renewals" customers={customers} products={products} chips={chips} />

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No renewals match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Customer</th>
                <th className="px-4 py-2 text-left font-medium">Renewal date</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Aging</th>
                <th className="px-4 py-2 text-right font-medium">Expected value</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-gray-900">{r.customer}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(r.renewalDate)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        r.overdue ? "text-red-600" : "text-slate-500"
                      }`}
                    >
                      {r.overdue ? `${Math.abs(r.daysUntil ?? 0)}d overdue` : `in ${r.daysUntil}d`}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.aging ? <RenewalAgingTag aging={r.aging} /> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">
                    {formatPaise(r.amountPaise)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.siteId ? (
                      <Link href={`/sites/${r.siteId}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                        Open →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
