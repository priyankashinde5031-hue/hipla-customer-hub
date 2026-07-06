// Skeleton placeholders shown while a module's data loads (spec §4: "skeleton
// rows, not spinners; render each module independently as its data arrives").

export function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
      <div className="mt-3 h-7 w-28 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

// Skeleton for a full module page (renewals/invoices/implementations/usage):
// header row + a table of placeholder rows.
export function ModulePageSkeleton({ title }: { title: string }) {
  return (
    <div>
      <div className="h-8 w-40 animate-pulse rounded bg-slate-100" aria-label={`Loading ${title}`} />
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PanelSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
