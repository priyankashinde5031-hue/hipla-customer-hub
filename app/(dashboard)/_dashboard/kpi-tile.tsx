import Link from "next/link";
import { ArrowRight } from "lucide-react";

// A single KPI tile (spec §1 Row 1). Money-first: `value` is the large headline
// (lead with ₹), `count` the small secondary. The WHOLE tile is a click target
// that drills to the module page pre-filtered (spec §4). `tone` tints the value
// + border: red for money at risk, amber for a warning count, default neutral.
export type KpiTone = "default" | "red" | "amber";

const VALUE_TONE: Record<KpiTone, string> = {
  default: "text-gray-900",
  red: "text-red-600",
  amber: "text-amber-600",
};
const BORDER_TONE: Record<KpiTone, string> = {
  default: "border-gray-200",
  red: "border-red-200",
  amber: "border-amber-200",
};

export function KpiTile({
  href,
  label,
  value,
  count,
  secondary,
  positive,
  tone = "default",
}: {
  href: string;
  label: string;
  value: string;
  count?: string | null;
  secondary?: string | null;
  positive?: string | null; // the paired good-news figure, shown in green
  tone?: KpiTone;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border ${BORDER_TONE[tone]} bg-white p-4 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <ArrowRight className="size-3.5 text-slate-300 transition-colors group-hover:text-indigo-500" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tabular-nums ${VALUE_TONE[tone]}`}>
          {value}
        </span>
        {count ? <span className="text-sm text-slate-500">{count}</span> : null}
      </div>
      <p className="mt-1 min-h-[1rem] text-xs text-slate-500">{secondary ?? ""}</p>
      {positive ? (
        <p className="mt-0.5 text-xs font-medium text-emerald-600">{positive}</p>
      ) : null}
    </Link>
  );
}
