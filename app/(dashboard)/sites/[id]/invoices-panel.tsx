"use client";

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { formatPaise } from "@/lib/currency";
import { formatDate as formatDisplayDate } from "@/lib/date";
import { RecordPaymentButton } from "./payment-form";
import { EditInvoiceButton } from "./invoice-edit-form";

// Status pill colors — mirrors the STATUS_STYLES map in page.tsx so the
// invoice status badge looks identical whether rendered here or elsewhere.
const STATUS_STYLES: Record<string, string> = {
  cleared: "bg-emerald-50 text-emerald-700",
  "part-paid": "bg-amber-50 text-amber-700",
  due: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
  draft: "bg-slate-100 text-slate-600",
  raised: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

// A payment recorded against an invoice — the flat shape passed from the server.
export type PanelPayment = {
  id: string;
  received_date: string | null;
  mode: string | null;
  reference: string | null;
  amount_paise: number;
};

// One invoice, flattened server-side into plain values the client can render.
export type PanelInvoice = {
  id: string;
  invoice_number: string;
  amount_paise: number;
  gst_amount_paise: number;
  total_paise: number;
  /** Stored status (used by the edit form); display uses computedStatus. */
  status: string;
  issue_date: string | null;
  due_date: string | null;
  renewal_id: string | null;
  /** Renewal year this invoice belongs to (2..5); null for original-PO invoices. */
  yearNumber: number | null;
  /** "Raised" date = the renewal/PO received date; distinct from the period date. */
  raisedDate: string | null;
  /** Derived status from invoice_balances (overdue/due/cleared/…). */
  computedStatus: string;
  balance_paise: number;
  payments: PanelPayment[];
};

// Money strip + payment table for a single invoice. Shared by attention rows
// and the rows inside an expanded year group so both look identical.
function InvoiceRow({
  inv,
  siteId,
  canEdit,
}: {
  inv: PanelInvoice;
  siteId: string;
  canEdit: boolean;
}) {
  const status = inv.computedStatus;
  const isOverdue = status === "overdue";
  const yearLabel = inv.renewal_id
    ? `Renewal${inv.yearNumber ? ` · Yr ${inv.yearNumber}` : ""}`
    : "PO invoice";

  return (
    <div
      className={`rounded-lg border p-3 shadow-sm ${
        isOverdue ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-gray-900">{inv.invoice_number}</span>
          {inv.renewal_id ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {yearLabel}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {yearLabel}
            </span>
          )}
          {inv.raisedDate && (
            <span className="text-slate-500">
              Raised {formatDisplayDate(inv.raisedDate)}
            </span>
          )}
          <span className="text-slate-500">
            Period {formatDisplayDate(inv.issue_date)}
          </span>
          <span className="text-slate-500">
            Due {formatDisplayDate(inv.due_date)}
          </span>
          <StatusBadge status={status} />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="text-slate-500">Amount {formatPaise(inv.amount_paise)}</span>
          <span className="text-slate-500">GST {formatPaise(inv.gst_amount_paise)}</span>
          <span className="font-medium text-gray-900">
            Total {formatPaise(inv.total_paise)}
          </span>
          <span className="font-medium text-gray-900">
            Balance {formatPaise(inv.balance_paise)}
          </span>
          {canEdit && status !== "cleared" && status !== "cancelled" && (
            <RecordPaymentButton
              invoiceId={inv.id}
              invoiceNumber={inv.invoice_number}
              balancePaise={inv.balance_paise}
              siteId={siteId}
            />
          )}
          {canEdit && (
            <EditInvoiceButton
              invoiceId={inv.id}
              invoiceNumber={inv.invoice_number}
              currentStatus={inv.status}
              issueDate={inv.issue_date}
              dueDate={inv.due_date}
              siteId={siteId}
            />
          )}
        </div>
      </div>

      {inv.payments.length > 0 && (
        <table className="mt-2 w-full text-sm">
          <thead className="text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-1 text-left font-medium">Received</th>
              <th className="py-1 text-left font-medium">Mode</th>
              <th className="py-1 text-left font-medium">Reference</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inv.payments.map((p) => (
              <tr key={p.id}>
                <td className="py-1 text-slate-700">{formatDisplayDate(p.received_date)}</td>
                <td className="py-1 text-slate-700">{p.mode || "—"}</td>
                <td className="py-1 text-slate-700">{p.reference || "—"}</td>
                <td className="py-1 text-right tabular-nums text-gray-900">
                  {formatPaise(p.amount_paise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// A small summary tile in the panel header (Invoiced / Collected / …).
function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const valueColor =
    tone === "danger"
      ? "text-red-700"
      : tone === "success"
        ? "text-emerald-700"
        : "text-gray-900";
  const box =
    tone === "danger"
      ? "border-red-200 bg-red-50/60"
      : "border-slate-200 bg-white";
  return (
    <div className={`rounded-lg border px-3 py-2 shadow-sm ${box}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

// A collapsible group of settled invoices for one renewal year. Folded by
// default — expands to reveal the individual invoice rows (with payments).
function YearGroup({
  title,
  invoices,
  siteId,
  canEdit,
}: {
  title: string;
  invoices: PanelInvoice[];
  siteId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const total = invoices.reduce((s, inv) => s + inv.total_paise, 0);
  const allCleared = invoices.every((inv) => inv.computedStatus === "cleared");

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
      >
        <span className="flex flex-wrap items-center gap-2">
          <svg
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 5l6 5-6 5" />
          </svg>
          <span className="font-medium text-gray-900">{title}</span>
          <span className="text-slate-500">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            {allCleared ? " · all cleared" : ""}
          </span>
          {allCleared && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Cleared
            </span>
          )}
        </span>
        <span className="tabular-nums text-slate-500">{formatPaise(total)}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          {invoices.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} siteId={siteId} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

const ATTENTION_STATUSES = new Set(["overdue", "due", "part-paid"]);

// The full invoices panel for one PO. Renders a summary bar, the
// needs-attention invoices as open rows, and the remaining (settled) invoices
// folded into collapsible groups by renewal year.
export function InvoicesPanel({
  invoices,
  siteId,
  canEdit,
  headerAction,
}: {
  invoices: PanelInvoice[];
  siteId: string;
  canEdit: boolean;
  /** The Generate / Add-single controls, rendered server-side and slotted in. */
  headerAction?: React.ReactNode;
}) {
  const { invoicedPaise, collectedPaise, outstandingPaise, overdueCount, overduePaise } =
    useMemo(() => {
      let invoiced = 0;
      let collected = 0;
      let outstanding = 0;
      let oCount = 0;
      let oPaise = 0;
      for (const inv of invoices) {
        if (inv.computedStatus === "cancelled") continue;
        invoiced += inv.total_paise;
        collected += inv.total_paise - inv.balance_paise;
        outstanding += inv.balance_paise;
        if (inv.computedStatus === "overdue") {
          oCount += 1;
          oPaise += inv.balance_paise;
        }
      }
      return {
        invoicedPaise: invoiced,
        collectedPaise: collected,
        outstandingPaise: outstanding,
        overdueCount: oCount,
        overduePaise: oPaise,
      };
    }, [invoices]);

  // Attention = anything needing collection. Everything else (cleared,
  // cancelled) folds into year groups so the settled history stays out of the way.
  const attention = invoices.filter((inv) => ATTENTION_STATUSES.has(inv.computedStatus));
  const settled = invoices.filter((inv) => !ATTENTION_STATUSES.has(inv.computedStatus));

  // Group settled invoices by renewal year. year=1 (or null renewal) is the
  // original PO; years 2+ come from renewal projections. Sorted newest first.
  const groups = useMemo(() => {
    const byYear = new Map<number, PanelInvoice[]>();
    for (const inv of settled) {
      const yr = inv.renewal_id ? inv.yearNumber ?? 0 : 1;
      const list = byYear.get(yr) || [];
      list.push(inv);
      byYear.set(yr, list);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([yr, list]) => ({
        year: yr,
        title: yr === 1 ? "Original PO" : `Year ${yr} renewal`,
        invoices: list,
      }));
  }, [settled]);

  return (
    <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-serif font-semibold text-indigo-900">
          <Receipt className="size-4 text-indigo-600" />
          Invoices
          {invoices.length > 0 && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {invoices.length}
            </span>
          )}
        </h3>
        {headerAction ? (
          <span className="flex items-center gap-3">{headerAction}</span>
        ) : null}
      </div>

      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">
          No invoices raised against this PO for this site yet.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label="Invoiced" value={formatPaise(invoicedPaise)} />
            <SummaryTile label="Collected" value={formatPaise(collectedPaise)} tone="success" />
            <SummaryTile label="Outstanding" value={formatPaise(outstandingPaise)} />
            <SummaryTile
              label="Overdue"
              value={
                overdueCount === 0 ? "None" : `${overdueCount} · ${formatPaise(overduePaise)}`
              }
              tone={overdueCount > 0 ? "danger" : undefined}
            />
          </div>

          {attention.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Needs attention ({attention.length})
              </p>
              <div className="space-y-3">
                {attention.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} siteId={siteId} canEdit={canEdit} />
                ))}
              </div>
            </div>
          )}

          {groups.length > 0 && (
            <div className="mt-4 space-y-2">
              {attention.length > 0 && (
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Settled
                </p>
              )}
              {groups.map((g) => (
                <YearGroup
                  key={g.year}
                  title={g.title}
                  invoices={g.invoices}
                  siteId={siteId}
                  canEdit={canEdit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
