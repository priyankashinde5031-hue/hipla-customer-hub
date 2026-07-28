import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/date";
import { getDashboardData, getFilterOptions, parseFilterParams } from "@/lib/dashboard-metrics";
import { ModuleHeader, StatusChip, chipHref } from "../_dashboard/module-header";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

// Portfolio Implementations page — the "View all →" destination. Unlike the
// dashboard panel (at-risk only), this shows every project, all statuses.
export default async function ImplementationsPage({
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
  const data = await getDashboardData(supabase, filter, { allImplementations: true });

  const status = typeof sp.status === "string" ? sp.status : "in_progress";
  const rows = data.implementation.rows.filter((p) =>
    status === "at_risk"
      ? p.atRisk
      : status === "in_progress"
        ? p.overallStatus === "in_progress"
        : status === "completed"
          ? p.overallStatus === "completed"
          : true,
  );

  const chips = (
    <>
      <StatusChip href={chipHref("/implementations", sp, "all")} label={`All (${data.implementation.rows.length})`} active={status === "all"} />
      <StatusChip href={chipHref("/implementations", sp, "at_risk")} label={`At risk (${data.implementation.atRiskCount})`} active={status === "at_risk"} />
      <StatusChip href={chipHref("/implementations", sp, "in_progress")} label={`Active (${data.implementation.activeCount})`} active={status === "in_progress"} />
      <StatusChip href={chipHref("/implementations", sp, "completed")} label="Completed" active={status === "completed"} />
    </>
  );

  return (
    <div>
      <ModuleHeader title="Implementations" basePath="/implementations" customers={customers} products={products} chips={chips} />

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No projects match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Customer</th>
                <th className="px-4 py-2 text-left font-medium">Project</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Stage</th>
                <th className="px-4 py-2 text-left font-medium">In stage</th>
                <th className="px-4 py-2 text-left font-medium">Target go-live</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.atRisk ? "bg-red-50/30" : ""}`}>
                  <td className="px-4 py-2 text-gray-900">{p.customer}</td>
                  <td className="px-4 py-2 text-slate-600">{p.projectName}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs text-slate-600">{STATUS_LABEL[p.overallStatus] ?? p.overallStatus}</span>
                    {p.atRisk ? (
                      <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">at risk</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-slate-600">Stage {p.currentStage}/5</td>
                  <td className="px-4 py-2 text-slate-600 tabular-nums">
                    {p.daysInStage !== null ? `${p.daysInStage}d` : "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {p.targetGoLive ? (
                      <span className={p.daysOverGoLive && p.daysOverGoLive > 0 ? "font-medium text-red-600" : "text-slate-600"}>
                        {formatDate(p.targetGoLive)}
                        {p.daysOverGoLive && p.daysOverGoLive > 0 ? ` · ${p.daysOverGoLive}d late` : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/sites/${p.siteId}/implementation`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                      Open →
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
