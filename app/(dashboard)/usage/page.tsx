import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData, getFilterOptions, parseFilterParams } from "@/lib/dashboard-metrics";
import { ModuleHeader, StatusChip, chipHref } from "../_dashboard/module-header";
import { Sparkline } from "../_dashboard/tags";

type SearchParams = Record<string, string | string[] | undefined>;

// Portfolio Usage page — the "View all →" destination for Usage alerts. Shows
// every tracked customer's latest-week deviation, worst first. This is where the
// detailed per-week browsing lives (spec §3); v1 surfaces the latest week for
// each site+module — deeper week/month/year history is a follow-up.
export default async function UsagePage({
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
  const data = await getDashboardData(supabase, filter, { allUsage: true });

  const status = typeof sp.status === "string" ? sp.status : "all";
  const rows = data.usage.rows.filter((u) => (status === "below" ? u.belowExpected : true));

  const chips = (
    <>
      <StatusChip href={chipHref("/usage", sp, null)} label={`All tracked (${data.usage.rows.length})`} active={status === "all"} />
      <StatusChip href={chipHref("/usage", sp, "below")} label={`Below expected (${data.usage.belowExpectedCount})`} active={status === "below"} />
    </>
  );

  return (
    <div>
      <ModuleHeader title="Usage" basePath="/usage" customers={customers} products={products} chips={chips} />

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No tracked usage yet — set expected weekly targets on a site&apos;s Usage page.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Customer</th>
                <th className="px-4 py-2 text-left font-medium">Module</th>
                <th className="px-4 py-2 text-right font-medium">This week</th>
                <th className="px-4 py-2 text-right font-medium">Expected</th>
                <th className="px-4 py-2 text-right font-medium">Deviation</th>
                <th className="px-4 py-2 text-left font-medium">Last 4 weeks</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={`${u.siteId}-${u.moduleName}`} className={`hover:bg-slate-50 ${u.belowExpected ? "bg-red-50/30" : ""}`}>
                  <td className="px-4 py-2 text-gray-900">{u.customer}</td>
                  <td className="px-4 py-2 text-slate-600">{u.moduleName}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{u.actualPerWeek}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{u.expectedPerWeek}</td>
                  <td className={`px-4 py-2 text-right font-medium tabular-nums ${u.deviationPct < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {u.deviationPct > 0 ? "+" : ""}
                    {Math.round(u.deviationPct)}%
                  </td>
                  <td className="px-4 py-2"><Sparkline values={u.trend} /></td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/sites/${u.siteId}/usage`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                      View →
                    </Link>
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
