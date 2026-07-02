// Shimmer skeleton for the Organizations list while it loads (design-system
// §5.8: every async section renders a skeleton shaped like its final layout,
// never a blank flash). The `.skeleton` class carries the shimmer +
// reduced-motion handling from globals.css.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-hidden="true">
      {/* Header: title + subtitle + Add button */}
      <div className="flex items-start justify-between">
        <div>
          <Bar className="h-8 w-56" />
          <Bar className="mt-2 h-3 w-48" />
        </div>
        <Bar className="h-9 w-40 rounded-lg" />
      </div>

      {/* Table card */}
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-slate-50 px-4 py-3">
          <Bar className="h-3 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <Bar className="h-4 w-48" />
            <Bar className="ml-auto h-4 w-24" />
            <Bar className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
