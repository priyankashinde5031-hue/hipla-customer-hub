"use client";

import { useState } from "react";
import { formatPaise, formatPaiseShort } from "@/lib/currency";
import { formatMonthYear } from "@/lib/date";

export type ChartBar = {
  month: string; // "YYYY-MM"
  recognised: number;
  projected: number;
  total: number;
};

// Hero chart (spec §10): 12 monthly bars stacked by recognition status —
// recognised saturated, projected pale, so certainty reads left→right. The
// current month is emphasised. Hover shows the monthly split. Pure inline
// styling (no chart library) so it works inside the app's CSP.
export function RevenueChart({
  bars,
  currentMonth,
}: {
  bars: ChartBar[];
  currentMonth: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.total));
  const CHART_H = 200; // px

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-600" /> Recognised
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-200" /> Projected
        </span>
      </div>

      <div className="mt-4 flex items-end gap-1.5" style={{ height: CHART_H }}>
        {bars.map((b, i) => {
          const isCurrent = b.month === currentMonth;
          const recH = (b.recognised / max) * CHART_H;
          const projH = (b.projected / max) * CHART_H;
          return (
            <div
              key={b.month}
              className="relative flex flex-1 flex-col justify-end"
              style={{ height: CHART_H }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 w-44 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg">
                  <div className="font-medium text-gray-900">
                    {formatMonthYear(`${b.month}-01`)}
                  </div>
                  <div className="mt-1 flex justify-between text-indigo-700">
                    <span>Recognised</span>
                    <span className="tabular-nums">{formatPaise(b.recognised)}</span>
                  </div>
                  <div className="flex justify-between text-indigo-400">
                    <span>Projected</span>
                    <span className="tabular-nums">{formatPaise(b.projected)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-medium text-gray-900">
                    <span>Total</span>
                    <span className="tabular-nums">{formatPaise(b.total)}</span>
                  </div>
                </div>
              )}
              {/* Projected (pale) on top, recognised (saturated) at the base. */}
              <div
                className="w-full rounded-t-sm bg-indigo-200"
                style={{ height: Math.max(0, projH) }}
              />
              <div
                className={`w-full bg-indigo-600 ${projH < 1 ? "rounded-t-sm" : ""}`}
                style={{ height: Math.max(0, recH) }}
              />
              {/* Emphasise the current month with a ring under the bar. */}
              <div
                className={`mt-1 h-0.5 w-full rounded ${isCurrent ? "bg-indigo-500" : "bg-transparent"}`}
              />
            </div>
          );
        })}
      </div>

      {/* Month axis labels */}
      <div className="mt-1 flex gap-1.5">
        {bars.map((b) => (
          <div
            key={b.month}
            className={`flex-1 text-center text-[10px] ${
              b.month === currentMonth ? "font-semibold text-indigo-600" : "text-slate-400"
            }`}
          >
            {b.month.slice(5)}
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-[10px] text-slate-400">
        Peak month: {formatPaiseShort(max)}
      </div>
    </div>
  );
}
