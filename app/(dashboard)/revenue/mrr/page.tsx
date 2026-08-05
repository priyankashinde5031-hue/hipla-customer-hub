import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaiseShort } from "@/lib/currency";
import {
  monthFirstDay,
  currentYearMonth,
  fetchScheduleRowsPaged,
} from "@/lib/revenue-schedule";
import {
  currentFyStartYear,
  fyLabelForStartYear,
  monthlyBars,
  quarterTable,
  revenueKpis,
  type ReportRow,
} from "@/lib/revenue-reporting";
import { RevenueChart } from "./revenue-chart";

type SearchParams = Record<string, string | string[] | undefined>;

// ₹ crore to one decimal, em-dash for zero (spec §10 quarterly table).
function crore(paise: number): string {
  if (paise === 0) return "—";
  return `₹${(paise / 1_00_00_00_000).toFixed(1)} Cr`;
}

// /revenue/mrr — the MRR / ARR reporting page (spec §10). Roomy: big metric
// cards, a generous 12-month chart, a short quarterly table.
export default async function MrrPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const currentStart = currentFyStartYear();
  const startYear =
    typeof sp.fy === "string" && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : currentStart;
  const fyLbl = fyLabelForStartYear(startYear);
  const currentMonth = currentYearMonth();

  // Rows for the selected FY drive the cards, chart and quarterly table. A busy
  // FY has more schedule rows than Supabase's default 1000-row page, so page
  // through them all — otherwise every FY total would be silently truncated.
  const fyRows = (await fetchScheduleRowsPaged(supabase, (q) =>
    q.eq("fy_label", fyLbl),
  )) as ReportRow[];

  // Current-month revenue = every component landing in the real current month,
  // independent of which FY is being viewed. Fetched separately so switching FY
  // never changes it.
  const monthRows = await fetchScheduleRowsPaged(supabase, (q) =>
    q.eq("period_month", monthFirstDay(currentMonth)),
  );
  const monthTotal = monthRows.reduce((t, r) => t + r.amount_paise, 0);

  const k = revenueKpis(fyRows, startYear, currentMonth);
  const bars = monthlyBars(fyRows, startYear);
  const qt = quarterTable(fyRows, startYear);

  // FY selector: the current FY, one back, and five forward (renewals project
  // up to five years out).
  const fyOptions: number[] = [];
  for (let y = currentStart - 1; y <= currentStart + 5; y++) fyOptions.push(y);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
          Revenue · ARR
        </h1>
        <Link
          href="/revenue/unrecognised"
          className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
        >
          Unrecognised revenue →
        </Link>
      </div>

      {/* FY selector */}
      <div className="flex flex-wrap gap-2">
        {fyOptions.map((y) => (
          <Link
            key={y}
            href={`/revenue/mrr?fy=${y}`}
            aria-current={y === startYear ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              y === startYear
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {fyLabelForStartYear(y)}
          </Link>
        ))}
      </div>

      {/* Four metric cards. ARR = the whole-FY total of every component that
          falls in the FY (owner's definition), not a recurring run-rate. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={`${fyLbl} ARR`}
          value={formatPaiseShort(k.arrPaise)}
          sub={`${formatPaiseShort(k.recognisedPaise)} recognised · ${formatPaiseShort(k.projectedPaise)} projected`}
        />
        <MetricCard
          label="Recognised to date"
          value={formatPaiseShort(k.recognisedPaise)}
          sub={`${Math.round(k.recognisedShare * 100)}% of ARR`}
          tone="good"
        />
        <MetricCard
          label="Projected (rest of FY)"
          value={formatPaiseShort(k.projectedPaise)}
          sub="not yet delivered"
        />
        <MetricCard
          label="This month"
          value={formatPaiseShort(monthTotal)}
          sub={`all revenue · ${formatMonthLabel(currentMonth)}`}
        />
      </div>

      {/* Hero chart */}
      <RevenueChart bars={bars} currentMonth={currentMonth} />

      {/* Quarterly table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{fyLbl}</th>
              <th className="px-4 py-2 text-right font-medium">Q1</th>
              <th className="px-4 py-2 text-right font-medium">Q2</th>
              <th className="px-4 py-2 text-right font-medium">Q3</th>
              <th className="px-4 py-2 text-right font-medium">Q4</th>
              <th className="px-4 py-2 text-right font-medium">FY total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <QuarterRow label="Recognised" pick={(c) => c.recognised} qt={qt} strong />
            <QuarterRow label="Projected" pick={(c) => c.projected} qt={qt} />
            <QuarterRow label="Total" pick={(c) => c.total} qt={qt} strong />
          </tbody>
        </table>
      </div>

      {fyRows.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No revenue scheduled in {fyLbl} yet. As line items get a recognition method
          (and a go-live or expected date), they’ll appear here automatically.
        </p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums ${tone === "good" ? "text-emerald-700" : "text-gray-900"}`}
        style={{ fontSize: 28, lineHeight: 1.1 }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function QuarterRow({
  label,
  pick,
  qt,
  strong,
}: {
  label: string;
  pick: (c: { recognised: number; projected: number; total: number }) => number;
  qt: ReturnType<typeof quarterTable>;
  strong?: boolean;
}) {
  const cls = strong ? "font-medium text-gray-900" : "text-slate-600";
  return (
    <tr>
      <td className={`px-4 py-2 ${cls}`}>{label}</td>
      {qt.quarters.map((c, i) => (
        <td key={i} className={`px-4 py-2 text-right tabular-nums ${cls}`}>
          {crore(pick(c))}
        </td>
      ))}
      <td className={`px-4 py-2 text-right tabular-nums ${cls}`}>{crore(pick(qt.fyTotal))}</td>
    </tr>
  );
}

function formatMonthLabel(yearMonth: string): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) return yearMonth;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
