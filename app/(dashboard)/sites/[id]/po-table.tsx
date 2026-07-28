"use client";

import { useMemo, useState, type ReactNode } from "react";

// PO "status" pill = the PO Type catalog value (spec Appendix A.4 — New PO,
// New PO on invoice, Renewal PO, …). We do NOT invent a lifecycle status.
// Colors follow the design-system status tokens (§2.44): New = progress/blue,
// New-on-invoice = warning/amber, Renewal = live/green, unknown = neutral.
const PO_TYPE_STYLES: Record<string, string> = {
  "New PO": "bg-blue-50 text-blue-700",
  "New PO on agreement": "bg-blue-50 text-blue-700",
  "New PO on invoice": "bg-amber-50 text-amber-700",
  "Renewal PO": "bg-emerald-50 text-emerald-700",
  "Renewal on agreement": "bg-emerald-50 text-emerald-700",
  "Renewal on invoice": "bg-emerald-50 text-emerald-700",
};

function poTypeStyle(label: string): string {
  if (PO_TYPE_STYLES[label]) return PO_TYPE_STYLES[label];
  if (/^renewal/i.test(label)) return "bg-emerald-50 text-emerald-700";
  if (/^new/i.test(label)) return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

export function PoStatusBadge({ label }: { label: string | null }) {
  if (!label) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${poTypeStyle(label)}`}
    >
      {label}
    </span>
  );
}

export type PoRowProps = {
  poNumber: string;
  statusLabel: string | null;
  product: string;
  type: string;
  date: string;
  amount: string;
  /** Number of columns, so the expanded detail cell spans the full width. */
  colSpan: number;
  /** Edit control; rendered in the Actions cell, never toggles the row. */
  actions?: ReactNode;
  /** The expandable detail panel (invoices, line items, renewals). */
  children: ReactNode;
};

// A single PO summary row that expands in place to reveal its detail panel.
// Each row owns its open state, so several POs can be open at once — same as
// the old <details> cards, just as a proper table.
export function PoTableRow({
  poNumber,
  statusLabel,
  product,
  type,
  date,
  amount,
  colSpan,
  actions,
  children,
}: PoRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="group cursor-pointer border-b border-slate-100 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={(e) => {
          // Only respond to keys landing on the row itself. The Edit PO dialog
          // is rendered inside this row's `actions`; React portals bubble the
          // dialog's key events up through the component tree, so without this
          // guard pressing Space in a dialog input would be swallowed here
          // (breaking the spacebar in free-text fields) and toggle the row.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <td className="py-3 pl-2 pr-3 align-middle">
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 20 20"
              className={`size-4 shrink-0 text-slate-400 transition-transform ${
                open ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 5l6 5-6 5" />
            </svg>
            <span className="font-medium text-gray-900">{poNumber}</span>
          </span>
        </td>
        <td className="px-3 py-3 align-middle">
          <PoStatusBadge label={statusLabel} />
        </td>
        <td className="px-3 py-3 align-middle text-sm text-slate-600">
          {product || "—"}
        </td>
        <td className="px-3 py-3 align-middle text-sm text-slate-600">
          {type || "—"}
        </td>
        <td className="px-3 py-3 align-middle text-sm tabular-nums text-slate-600">
          {date}
        </td>
        <td className="px-3 py-3 text-right align-middle font-medium tabular-nums text-gray-900">
          {amount}
        </td>
        <td
          className="py-3 pl-3 pr-2 text-right align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          {actions ? (
            <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {actions}
            </span>
          ) : null}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100">
          <td colSpan={colSpan} className="bg-slate-50/40 p-0">
            <div className="px-4 py-3">{children}</div>
          </td>
        </tr>
      )}
    </>
  );
}

// One PO's already-rendered row plus the two values we filter on. The row is
// built server-side (page.tsx) and passed in as an opaque node; we only need
// its PO type and financial year to decide whether to show it.
export type PoFilterItem = {
  id: string;
  /** PO Type catalog value, e.g. "New PO", "Renewal PO". Null = not set. */
  poType: string | null;
  /** Financial year label, e.g. "2024–25". Null = not set. */
  financialYear: string | null;
  node: ReactNode;
};

const ALL = "__all__";
const UNSET = "__unset__";

// The PO table with a filter bar above it. Type + Financial year are read from
// the POs already entered; "All" (the default) shows everything. Both filters
// combine (AND). Pure client-side — no refetch, just hides rows.
export function PoFilterTable({ rows }: { rows: PoFilterItem[] }) {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [yearFilter, setYearFilter] = useState<string>(ALL);

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.poType).filter((v): v is string => !!v)),
      ).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const yearOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.financialYear).filter((v): v is string => !!v)),
      ).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const hasUnsetType = useMemo(() => rows.some((r) => !r.poType), [rows]);
  const hasUnsetYear = useMemo(() => rows.some((r) => !r.financialYear), [rows]);

  const visible = rows.filter((r) => {
    const typeOk =
      typeFilter === ALL ||
      (typeFilter === UNSET ? !r.poType : r.poType === typeFilter);
    const yearOk =
      yearFilter === ALL ||
      (yearFilter === UNSET ? !r.financialYear : r.financialYear === yearFilter);
    return typeOk && yearOk;
  });

  const selectClass =
    "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b border-gray-100 px-4 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            PO type
          </span>
          <select
            className={selectClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value={ALL}>All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {hasUnsetType && <option value={UNSET}>— (not set)</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Financial year
          </span>
          <select
            className={selectClass}
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value={ALL}>All years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            {hasUnsetYear && <option value={UNSET}>— (not set)</option>}
          </select>
        </label>
        {(typeFilter !== ALL || yearFilter !== ALL) && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter(ALL);
              setYearFilter(ALL);
            }}
            className="pb-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto pb-1.5 text-sm text-slate-500 tabular-nums">
          {visible.length} of {rows.length} POs
        </span>
      </div>
      <table className="w-full border-collapse text-left [font-variant-numeric:tabular-nums]">
        <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr className="border-b border-slate-200">
            <th className="py-2 pl-2 pr-3 font-medium">PO Name</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Renewal / Expiry</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="py-2 pl-3 pr-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-sm text-slate-400"
              >
                No purchase orders match the selected filters.
              </td>
            </tr>
          ) : (
            visible.map((r) => <PoRowFragment key={r.id}>{r.node}</PoRowFragment>)
          )}
        </tbody>
      </table>
    </div>
  );
}

// The row node is already a <> fragment of <tr>s; render it straight through.
function PoRowFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
