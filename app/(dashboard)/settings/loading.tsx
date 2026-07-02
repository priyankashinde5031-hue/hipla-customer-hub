// Shimmer skeleton for the Settings landing (grid of catalog tiles) while it
// loads, shaped like the final layout (design-system §5.8).

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-hidden="true">
      <Bar className="h-8 w-40" />
      <Bar className="mt-2 h-3 w-72" />

      <div className="mt-6 grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <Bar className="h-4 w-32" />
            <Bar className="mt-3 h-3 w-full" />
            <Bar className="mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
