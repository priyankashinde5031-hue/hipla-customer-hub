import Link from "next/link";
import { FilterBar, type FilterOption } from "./filter-bar";

// Shared header for the four portfolio module pages: title, the same global
// filter bar (so filters carry over from the dashboard), and optional status
// chips. Chips are Links that preserve the current filter params.

export function ModuleHeader({
  title,
  basePath,
  customers,
  products,
  chips,
}: {
  title: string;
  basePath: string;
  customers: FilterOption[];
  products: FilterOption[];
  chips?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
          {title}
        </h1>
        <FilterBar customers={customers} products={products} basePath={basePath} />
      </div>
      {chips ? <div className="mt-3 flex flex-wrap gap-2">{chips}</div> : null}
    </div>
  );
}

// A single status chip. `active` styles the current selection; `href` keeps the
// rest of the query string intact (built by the caller).
export function StatusChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

// Build a querystring for a chip: current filter params + an overriding status.
export function chipHref(
  basePath: string,
  sp: Record<string, string | string[] | undefined>,
  status: string | null,
): string {
  const params = new URLSearchParams();
  for (const k of ["range", "customer", "module"]) {
    const v = sp[k];
    if (typeof v === "string" && v) params.set(k, v);
  }
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
