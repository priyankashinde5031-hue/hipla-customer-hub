// Shimmer skeleton for an Organization's detail page (its sites list) while it
// loads. Shaped like the final layout — back link, title, Sites table — so the
// content doesn't flash blank (design-system §5.8).

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-hidden="true">
      <Bar className="h-3 w-32" />
      <Bar className="mt-3 h-8 w-64" />
      <Bar className="mt-2 h-3 w-48" />

      {/* Sites heading + Add button */}
      <div className="mt-8 flex items-center justify-between">
        <Bar className="h-6 w-20" />
        <Bar className="h-9 w-28 rounded-lg" />
      </div>

      {/* Sites table */}
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-slate-50 px-4 py-3">
          <Bar className="h-3 w-40" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <Bar className="h-4 w-44" />
            <Bar className="ml-auto h-4 w-20" />
            <Bar className="h-5 w-16 rounded-full" />
            <Bar className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
