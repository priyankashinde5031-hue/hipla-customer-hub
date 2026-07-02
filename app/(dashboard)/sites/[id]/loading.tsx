// Shimmer skeleton shown while the Site 360 data loads (design-system §5.8:
// every async section renders a skeleton shaped like its final layout, never a
// blank flash). The `.skeleton` class carries the shimmer + reduced-motion
// handling from globals.css.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}
    >
      <Bar className="h-3 w-24" />
      <Bar className="mt-3 h-5 w-32" />
      <Bar className="mt-2 h-3 w-20" />
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-hidden="true">
      {/* Breadcrumb + title */}
      <Bar className="h-3 w-40" />
      <div className="mt-3 flex items-center gap-2">
        <Bar className="h-8 w-64" />
        <Bar className="h-5 w-10 rounded-full" />
      </div>

      {/* Site details card */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <Bar className="h-3 w-24" />
        <div className="mt-4 grid grid-cols-3 gap-x-8 gap-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Bar className="h-3 w-20" />
              <Bar className="mt-2 h-4 w-28" />
            </div>
          ))}
        </div>
      </div>

      {/* Addresses */}
      <Bar className="mt-8 h-6 w-32" />
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <Bar className="h-3 w-20" />
            <Bar className="mt-3 h-4 w-full" />
            <Bar className="mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>

      {/* PO & payments — summary cards + table */}
      <Bar className="mt-8 h-6 w-40" />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bar key={i} className="mb-3 h-6 w-full last:mb-0" />
        ))}
      </div>
    </div>
  );
}
