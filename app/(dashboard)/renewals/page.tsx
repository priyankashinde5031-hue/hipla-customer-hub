import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { getDashboardData, parseFilterParams } from "@/lib/dashboard-metrics";
import { RENEWAL_UPCOMING_DAYS } from "@/lib/dashboard-config";
import { StatusChip } from "../_dashboard/module-header";
import { RenewalAgingTag } from "../_dashboard/tags";

type SearchParams = Record<string, string | string[] | undefined>;

// Portfolio Renewals page — the "View all →" destination for Pending Renewals.
// The global dropdown filters (range/customer/product) are intentionally
// removed; the All / Overdue / Upcoming-30d / Later status chips remain, and
// the total at the top reflects whichever chip is selected.
export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // No dropdown filters — show the whole portfolio. Wide horizon so "All" /
  // "Later" can include every future renewal for planning.
  const filter = parseFilterParams({});
  const data = await getDashboardData(supabase, filter, { horizonDays: 3650 });

  const isUpcomingSoon = (r: (typeof data.renewals.rows)[number]) =>
    !r.overdue && (r.daysUntil ?? Infinity) <= RENEWAL_UPCOMING_DAYS;
  const isLater = (r: (typeof data.renewals.rows)[number]) =>
    !r.overdue && (r.daysUntil ?? Infinity) > RENEWAL_UPCOMING_DAYS;

  const status = typeof sp.status === "string" ? sp.status : "all";
  const rows = data.renewals.rows.filter((r) =>
    status === "overdue"
      ? r.overdue
      : status === "upcoming"
        ? isUpcomingSoon(r)
        : status === "later"
          ? isLater(r)
          : true,
  );

  const overdueCount = data.renewals.rows.filter((r) => r.overdue).length;
  const upcomingCount = data.renewals.rows.filter(isUpcomingSoon).length;
  const laterCount = data.renewals.rows.filter(isLater).length;

  // Total reflects the currently-selected chip.
  const totalPaise = rows.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0);
  const totalLabel =
    status === "overdue"
      ? "Total overdue renewal"
      : status === "upcoming"
        ? "Total upcoming renewal · 30d"
        : status === "later"
          ? "Total later renewal"
          : "Total renewal";

  const chipHref = (s: string | null) => (s ? `/renewals?status=${s}` : "/renewals");

  return (
    <div>
      <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
        Renewals
      </h1>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusChip href={chipHref(null)} label={`All (${data.renewals.rows.length})`} active={status === "all"} />
        <StatusChip href={chipHref("overdue")} label={`Overdue (${overdueCount})`} active={status === "overdue"} />
        <StatusChip href={chipHref("upcoming")} label={`Upcoming · 30d (${upcomingCount})`} active={status === "upcoming"} />
        <StatusChip href={chipHref("later")} label={`Later (${laterCount})`} active={status === "later"} />
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {totalLabel}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
          {formatPaise(totalPaise)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {rows.length} {rows.length === 1 ? "renewal" : "renewals"}
        </p>
      </div>

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
