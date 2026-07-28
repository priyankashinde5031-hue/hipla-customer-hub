// A simple presentational stat tile: an uppercase label, a big ₹ headline, a
// small sub-figure, and a muted caption. Unlike KpiTile it is not a drill-down
// link — it just states a computed figure (used for the "booked this FY"
// summary numbers on the dashboard).
export function FyStatTile({
  label,
  value,
  sub,
  caption,
}: {
  label: string;
  value: string;
  sub?: string | null;
  caption?: string | null;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-1 min-h-[1rem] text-xs text-slate-500">{sub ?? ""}</p>
      {caption ? <p className="mt-0.5 text-xs text-slate-400">{caption}</p> : null}
    </div>
  );
}
