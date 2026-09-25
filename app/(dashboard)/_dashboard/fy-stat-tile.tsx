import Link from "next/link";

// A simple presentational stat tile: an uppercase label, a big ₹ headline, a
// small sub-figure, and a muted caption. Used for the "booked this FY" summary
// numbers on the dashboard. When given an `href` it becomes a drill-down link
// (with a corner arrow), like the KPI tiles, so you can see which POs/renewals
// make up the figure.
export function FyStatTile({
  label,
  value,
  sub,
  caption,
  href,
}: {
  label: string;
  value: string;
  sub?: string | null;
  caption?: string | null;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {href ? (
          <span className="text-gray-300 transition-colors group-hover:text-indigo-500" aria-hidden>
            →
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-1 min-h-[1rem] text-xs text-slate-500">{sub ?? ""}</p>
      {caption ? <p className="mt-0.5 text-xs text-slate-400">{caption}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-slate-50"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {body}
    </div>
  );
}
