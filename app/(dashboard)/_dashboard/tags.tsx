import type { RenewalAging, InvoiceAging } from "@/lib/dashboard-metrics";

// Small aging pills used in the renewal + invoice rows (spec §2.1, §2.4). Colour
// escalates with age: fresh = slate, mid = amber, oldest = red.
const RENEWAL_STYLE: Record<RenewalAging, string> = {
  "0–30d": "bg-amber-50 text-amber-700",
  "31–90d": "bg-orange-50 text-orange-700",
  "90d+": "bg-red-50 text-red-700",
};

export function RenewalAgingTag({ aging }: { aging: RenewalAging }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${RENEWAL_STYLE[aging]}`}>
      {aging}
    </span>
  );
}

const INVOICE_STYLE: Record<InvoiceAging, string> = {
  Current: "bg-slate-100 text-slate-600",
  "1–30": "bg-amber-50 text-amber-700",
  "31–60": "bg-orange-50 text-orange-700",
  "60+": "bg-red-50 text-red-700",
};

export function InvoiceAgingTag({ aging }: { aging: InvoiceAging }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${INVOICE_STYLE[aging]}`}>
      {aging}
    </span>
  );
}

// Tiny inline sparkline for the usage trend (last ≤4 weeks). Pure SVG, no deps.
// Bars so a single point still renders; height encodes the count.
export function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 44;
  const h = 16;
  const gap = 2;
  const barW = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * h);
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={1}
            className="fill-slate-300"
          />
        );
      })}
    </svg>
  );
}
