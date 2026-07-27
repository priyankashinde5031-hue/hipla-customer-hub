"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Global filter bar (spec §3 / Row 0). ONE compact row of dropdowns — no heavy
// week/month/year grid (that lives on the Usage page). URL search params are the
// source of truth so KPI/"View all" links carry the filter into the destination
// page. Selection persists across sessions via localStorage: on first load with
// no params we restore the last selection.
//
// Keys: range (time), customer (org id), module (product line). Absent = default
// (this build shows overdue + each module's own upcoming window).

export type FilterOption = { id: string; name: string };

const STORAGE_KEY = "hub-dashboard-filter";
const FILTER_KEYS = ["range", "customer", "module"] as const;

const selectClass =
  "rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";

export function FilterBar({
  customers,
  products,
  basePath = "/",
}: {
  customers: FilterOption[];
  products: FilterOption[];
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = searchParams.get("range") ?? "";
  const customer = searchParams.get("customer") ?? "";
  const moduleId = searchParams.get("module") ?? "";
  const hasAny = FILTER_KEYS.some((k) => searchParams.get(k));

  // Restore the last selection on first mount when the URL carries no filter.
  useEffect(() => {
    if (hasAny) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, string>;
      const params = new URLSearchParams();
      for (const k of FILTER_KEYS) if (parsed[k]) params.set(k, parsed[k]);
      if ([...params.keys()].length) router.replace(`${pathname}?${params}`);
    } catch {
      /* ignore malformed storage */
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: Partial<Record<(typeof FILTER_KEYS)[number], string>>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const store: Record<string, string> = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) store[k] = v;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const clear = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    router.push(basePath);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Time range"
        className={selectClass}
        value={range}
        onChange={(e) => apply({ range: e.target.value })}
      >
        <option value="">This month</option>
        <option value="week">This week</option>
        <option value="quarter">This quarter</option>
        <option value="fy">This FY</option>
        <option value="lastfy">Last FY</option>
      </select>

      <select
        aria-label="Customer"
        className={selectClass}
        value={customer}
        onChange={(e) => apply({ customer: e.target.value })}
      >
        <option value="">All customers</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Product line"
        className={selectClass}
        value={moduleId}
        onChange={(e) => apply({ module: e.target.value })}
      >
        <option value="">All products</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {hasAny ? (
        <button
          type="button"
          onClick={clear}
          className="rounded text-xs font-medium text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
