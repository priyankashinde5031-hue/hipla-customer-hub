"use client";

export type ChartPoint = {
  label: string; // e.g. "W1 M7/2026"
  actual: number;
  expected: number | null; // null = no target set for this scope
};

// Hand-rolled SVG line chart (no charting dependency — keeps the app light and
// the styling on our own tokens). Two series: Actual (solid indigo) and
// Expected (dashed green). x-axis = weeks in range.
export function UsageChart({ points }: { points: ChartPoint[] }) {
  const width = 720;
  const height = 300;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 44;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        No usage entries in this range yet.
      </div>
    );
  }

  const maxVal = Math.max(
    1,
    ...points.map((p) => Math.max(p.actual, p.expected ?? 0)),
  );
  // Round the axis top up to a "nice" number so gridlines read cleanly.
  const niceMax = niceCeil(maxVal);

  const x = (i: number) =>
    padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  const actualPath = points.map((p, i) => `${x(i)},${y(p.actual)}`).join(" ");
  const expectedPts = points.filter((p) => p.expected !== null);
  const expectedPath =
    expectedPts.length > 0
      ? points
          .map((p, i) => (p.expected === null ? null : `${x(i)},${y(p.expected)}`))
          .filter(Boolean)
          .join(" ")
      : "";

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => (niceMax / ticks) * i);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[560px]"
        role="img"
        aria-label="Usage trend versus expected"
      >
        {/* horizontal gridlines + y labels */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="#E7E5E0"
              strokeDasharray={i === 0 ? undefined : "3 3"}
            />
            <text
              x={padL - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-slate-400"
              style={{ fontSize: 11 }}
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* x labels (thin out if crowded) */}
        {points.map((p, i) => {
          const step = Math.ceil(points.length / 6);
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={i}
              x={x(i)}
              y={height - padB + 20}
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 11 }}
            >
              {p.label}
            </text>
          );
        })}

        {/* expected (dashed green) */}
        {expectedPath && (
          <polyline
            points={expectedPath}
            fill="none"
            stroke="#15803D"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
        {points.map((p, i) =>
          p.expected === null ? null : (
            <circle key={`e${i}`} cx={x(i)} cy={y(p.expected)} r={3} fill="#15803D" />
          ),
        )}

        {/* actual (solid indigo) */}
        <polyline points={actualPath} fill="none" stroke="#4f46e5" strokeWidth={2.5} />
        {points.map((p, i) => (
          <circle
            key={`a${i}`}
            cx={x(i)}
            cy={y(p.actual)}
            r={3.5}
            fill="#fff"
            stroke="#4f46e5"
            strokeWidth={2}
          />
        ))}
      </svg>

      <div className="mt-2 flex items-center justify-center gap-6 text-xs">
        <span className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-0.5 w-5 bg-indigo-600" /> Actual entries
        </span>
        <span className="flex items-center gap-2 text-slate-600">
          <span
            className="inline-block h-0.5 w-5 border-t-2 border-dashed"
            style={{ borderColor: "#15803D" }}
          />{" "}
          Expected entries
        </span>
      </div>
    </div>
  );
}

// Smallest "nice" number (1/2/5 × 10ⁿ) ≥ v, for a clean axis top.
function niceCeil(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
