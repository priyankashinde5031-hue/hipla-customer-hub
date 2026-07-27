import { ArrowDownRight, ArrowUpRight } from "lucide-react";

// Layer 1 business-health tile (dashboard redesign brief). The largest type on
// the page: a big headline value, a delta chip vs the prior period, an optional
// secondary sub-figure (e.g. GRR under NRR), and a trailing-12-month sparkline.
// Health-first — colour is reserved: green for a positive move, red for a
// negative one, neutral otherwise. No alarm red here (that lives in the worklist).

// Line sparkline for a 12-point trailing series. Pure SVG, no deps. Flat/empty
// series render a baseline so the tile never looks broken.
function HeroSparkline({ values, positive }: { values: number[]; positive: boolean | null }) {
  const w = 120;
  const h = 32;
  const pad = 2;
  if (values.length < 2) {
    return <svg width={w} height={h} className="w-full" aria-hidden="true" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${h} L${points[0][0].toFixed(1)},${h} Z`;
  // Green when trending up, red when down, slate when flat/unknown.
  const stroke =
    positive === null ? "text-slate-400" : positive ? "text-emerald-500" : "text-red-400";
  const fill =
    positive === null ? "text-slate-100" : positive ? "text-emerald-50" : "text-red-50";
  return (
    <svg width={w} height={h} className="w-full" aria-hidden="true" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} className={`${fill} fill-current`} />
      <path d={line} className={`${stroke} fill-none stroke-current`} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DeltaChip({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return <span className="text-xs font-medium text-slate-400">—</span>;
  }
  const up = deltaPct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const cls = up ? "text-emerald-600" : "text-red-600";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      <Icon className="size-3.5" />
      {Math.abs(deltaPct).toFixed(1)}%
    </span>
  );
}

export function HeroTile({
  label,
  value,
  deltaPct,
  deltaCaption,
  secondary,
  series,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  deltaCaption?: string | null; // e.g. "vs a year ago"
  secondary?: string | null; // e.g. "GRR 98%" or "vs FY25–26 ₹1.2 Cr"
  series: number[];
}) {
  const positive = deltaPct === null ? null : deltaPct >= 0;
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-slate-900">{value}</span>
        <DeltaChip deltaPct={deltaPct} />
      </div>
      <p className="mt-0.5 min-h-[1rem] text-xs text-slate-500">
        {secondary ? <span className="font-medium text-slate-600">{secondary}</span> : null}
        {secondary && deltaCaption ? " · " : null}
        {deltaCaption ?? ""}
      </p>
      <div className="mt-3">
        <HeroSparkline values={series} positive={positive} />
      </div>
    </div>
  );
}
