// Month-by-month bar chart for the trailing 12 months. Unlike the tile
// sparkline (shape only), every bar is labelled with its ₹ value and its month,
// so the actual ARR / MRR figure for each month is readable at a glance
// (owner ask). Pure CSS/SVG, no client JS. Wide on small screens → the card
// scrolls horizontally rather than crushing the labels.

type Accent = "indigo" | "sky" | "emerald";

// Full literal class strings (not concatenated) so Tailwind's scanner generates
// both the solid latest-bar colour and the faded earlier-bar colour.
const BAR: Record<Accent, { full: string; faded: string }> = {
  indigo: { full: "bg-indigo-500", faded: "bg-indigo-500/45" },
  sky: { full: "bg-sky-500", faded: "bg-sky-500/45" },
  emerald: { full: "bg-emerald-500", faded: "bg-emerald-500/45" },
};

export function MonthlyBars({
  title,
  currentValue,
  labels,
  values,
  format,
  accent = "indigo",
}: {
  title: string;
  currentValue: string; // the headline (latest) value, shown big
  labels: string[]; // month labels, oldest → newest
  values: number[]; // paise per month, same order/length as labels
  format: (paise: number) => string;
  accent?: Accent;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
        <p className="text-lg font-semibold tabular-nums text-slate-900">{currentValue}</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-[420px] items-end gap-1.5" style={{ height: 132 }}>
          {values.map((v, i) => {
            const h = Math.max(3, Math.round((v / max) * 104)); // px within a 104px band
            const latest = i === values.length - 1;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span
                  className={`whitespace-nowrap text-[9px] tabular-nums ${
                    latest ? "font-semibold text-slate-700" : "text-slate-400"
                  }`}
                >
                  {format(v)}
                </span>
                <div
                  className={`w-full rounded-t ${latest ? BAR[accent].full : BAR[accent].faded}`}
                  style={{ height: h }}
                  title={`${labels[i]}: ${format(v)}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex min-w-[420px] gap-1.5">
          {labels.map((m, i) => (
            <span key={i} className="flex-1 text-center text-[10px] text-slate-400">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
