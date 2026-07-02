"use client";

import { useState, type ReactNode } from "react";

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
        className="group cursor-pointer border-b border-slate-100 hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={(e) => {
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
