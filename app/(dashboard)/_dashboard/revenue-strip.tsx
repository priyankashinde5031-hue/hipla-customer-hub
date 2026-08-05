import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaiseShort } from "@/lib/currency";
import {
  currentYearMonth,
  monthFirstDay,
  fetchScheduleRowsPaged,
} from "@/lib/revenue-schedule";
import {
  currentFyStartYear,
  fyLabelForStartYear,
  revenueKpis,
  type ReportRow,
} from "@/lib/revenue-reporting";

// Dashboard revenue strip (spec §10). Surfaces the same headline numbers as the
// Revenue page: FY ARR (every component that falls in the FY), its recognised /
// projected split, and the current-month revenue (all components). ARR is the
// owner's FY-total definition — never a recurring run-rate.
export async function RevenueStrip() {
  const supabase = await createClient();
  const startYear = currentFyStartYear();
  const fyLbl = fyLabelForStartYear(startYear);
  const currentMonth = currentYearMonth();

  const fyRows = (await fetchScheduleRowsPaged(supabase, (q) =>
    q.eq("fy_label", fyLbl),
  )) as ReportRow[];
  const monthRows = await fetchScheduleRowsPaged(supabase, (q) =>
    q.eq("period_month", monthFirstDay(currentMonth)),
  );
  const monthTotal = monthRows.reduce((t, r) => t + r.amount_paise, 0);

  const k = revenueKpis(fyRows, startYear, currentMonth);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-900">Revenue · {fyLbl}</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/revenue/unrecognised"
            className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            Unrecognised →
          </Link>
          <Link
            href="/revenue/mrr"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all →
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StripTile
          label="ARR"
          value={formatPaiseShort(k.arrPaise)}
          sub={`${formatPaiseShort(k.recognisedPaise)} recognised · ${formatPaiseShort(k.projectedPaise)} projected`}
        />
        <StripTile
          label="Recognised to date"
          value={formatPaiseShort(k.recognisedPaise)}
          sub={`${Math.round(k.recognisedShare * 100)}% of ARR`}
          tone="good"
        />
        <StripTile
          label="Projected (rest of FY)"
          value={formatPaiseShort(k.projectedPaise)}
          sub="not yet delivered"
        />
        <StripTile
          label="MRR — this month"
          value={formatPaiseShort(monthTotal)}
          sub="all revenue this month"
        />
      </div>
    </section>
  );
}

function StripTile({
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
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "good" ? "text-emerald-700" : "text-gray-900"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
