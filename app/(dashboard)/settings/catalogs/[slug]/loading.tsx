// Shimmer skeleton for a catalog settings page (title + a managed table) while
// it loads, shaped like the final layout (design-system §5.8).

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-hidden="true">
      <Bar className="h-8 w-48" />
      <Bar className="mt-2 h-3 w-80" />

      {/* Add button (right-aligned in the manager) */}
      <div className="mt-6 flex justify-end">
        <Bar className="h-9 w-32 rounded-lg" />
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-slate-50 px-4 py-3">
          <Bar className="h-3 w-40" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <Bar className="h-4 w-40" />
            <Bar className="ml-auto h-5 w-16 rounded-full" />
            <Bar className="h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
