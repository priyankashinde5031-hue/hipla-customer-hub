"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { buildSchedule, type PaymentTermSpec } from "@/lib/invoicing";
import { createInvoices, createSingleInvoice } from "./invoice-actions";

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function rupeesStr(paise: number): string {
  return (paise / 100).toFixed(2);
}

function paiseOf(rupeesStr: string): number {
  const n = Number(rupeesStr);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export type PoInvoiceContext = {
  poId: string;
  poNumber: string;
  poName: string | null;
  netPaise: number;
  gstPercent: number | null;
  contractMonths: number;
  poReceivedDate: string | null;
  term: PaymentTermSpec | null;
  termName: string | null;
  coveredSites: { id: string; name: string }[];
};

// Default billed site = the site we're viewing if the PO covers it, else the
// PO's first covered site.
function defaultBilledSite(ctx: PoInvoiceContext, currentSiteId: string): string {
  if (ctx.coveredSites.some((s) => s.id === currentSiteId)) return currentSiteId;
  return ctx.coveredSites[0]?.id ?? currentSiteId;
}

function BillToField({
  ctx,
  value,
  onChange,
}: {
  ctx: PoInvoiceContext;
  value: string;
  onChange: (v: string) => void;
}) {
  if (ctx.coveredSites.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="bill-to">Bill to site</Label>
      <select
        id="bill-to"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {ctx.coveredSites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type PreviewRow = {
  key: string;
  label: string;
  amount: string; // ₹
  gst: string; // ₹
  issueDate: string;
  dueDate: string;
};

function gstPaiseFor(amountPaise: number, gstPercent: number | null): number {
  const pct = gstPercent ?? 0;
  return pct > 0 ? Math.round((amountPaise * pct) / 100) : 0;
}

// Build the editable preview rows from a PO's payment-term schedule. Periodic
// terms space their dates from `startDate`; milestone terms leave dates blank.
function computeRows(ctx: PoInvoiceContext, startDate: string): PreviewRow[] {
  const term = ctx.term;
  if (!term) return [];
  const isPeriodic = term.scheduleType === "periodic";
  const generated = buildSchedule({
    totalPaise: ctx.netPaise,
    term,
    contractMonths: ctx.contractMonths,
    startDate: isPeriodic ? startDate : null,
  });
  return generated.map((g, i) => ({
    key: `g${i}`,
    label: g.label,
    amount: rupeesStr(g.amountPaise),
    gst: rupeesStr(gstPaiseFor(g.amountPaise, ctx.gstPercent)),
    issueDate: g.issueDate ?? "",
    dueDate: g.dueDate ?? "",
  }));
}

function GenerateDialog({
  ctx,
  siteId,
  onClose,
}: {
  ctx: PoInvoiceContext;
  siteId: string;
  onClose: () => void;
}) {
  const term = ctx.term;
  const isPeriodic = term?.scheduleType === "periodic";
  const [startDate, setStartDate] = useState(ctx.poReceivedDate || todayISO());
  const [billedSiteId, setBilledSiteId] = useState(() => defaultBilledSite(ctx, siteId));
  const [isPending, startTransition] = useTransition();

  // Build the initial rows from the schedule. Regenerated whenever the start
  // date changes (which resets any manual tweaks — intentional).
  const [rows, setRows] = useState<PreviewRow[]>(() => computeRows(ctx, startDate));

  function regenerate(newStart: string) {
    setStartDate(newStart);
    setRows(computeRows(ctx, newStart));
  }

  function updateRow(key: string, patch: Partial<PreviewRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const totals = useMemo(() => {
    const amount = rows.reduce((s, r) => s + paiseOf(r.amount), 0);
    const gst = rows.reduce((s, r) => s + paiseOf(r.gst), 0);
    return { amount, gst, total: amount + gst };
  }, [rows]);

  const splitMatches = Math.abs(totals.amount - ctx.netPaise) < 1;

  function submit() {
    const payload = rows.map((r) => ({
      amountPaise: paiseOf(r.amount),
      gstAmountPaise: paiseOf(r.gst),
      issueDate: r.issueDate || null,
      dueDate: r.dueDate || null,
    }));
    startTransition(async () => {
      const result = await createInvoices(ctx.poId, billedSiteId, siteId, payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.count} invoice${result.count === 1 ? "" : "s"} created.`);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate invoices</DialogTitle>
          <DialogDescription>
            {ctx.poNumber}
            {ctx.poName ? ` · ${ctx.poName}` : ""} — splitting {formatRupees(ctx.netPaise)}{" "}
            (ex-tax) by {ctx.termName ?? "the payment term"}.
          </DialogDescription>
        </DialogHeader>

        {!term ? (
          <p className="text-sm text-amber-700">
            This PO has no payment term set. Edit the PO and choose a payment term first, then
            come back to generate its invoices.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <BillToField ctx={ctx} value={billedSiteId} onChange={setBilledSiteId} />
            {isPeriodic && (
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start-date">First invoice date</Label>
                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => regenerate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <p className="pb-1.5 text-xs text-slate-500">
                  Changing this re-spaces the schedule.
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Invoice / stage</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount (₹)</th>
                    <th className="px-2 py-1.5 text-right font-medium">GST (₹)</th>
                    <th className="px-2 py-1.5 text-left font-medium">Issue date</th>
                    <th className="px-2 py-1.5 text-left font-medium">Due date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-2 py-1 text-slate-700">{r.label}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.amount}
                          onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                          className={`${inputClass} w-28 text-right`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.gst}
                          onChange={(e) => updateRow(r.key, { gst: e.target.value })}
                          className={`${inputClass} w-24 text-right`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={r.issueDate}
                          onChange={(e) => updateRow(r.key, { issueDate: e.target.value })}
                          className={`${inputClass} w-36`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={r.dueDate}
                          onChange={(e) => updateRow(r.key, { dueDate: e.target.value })}
                          className={`${inputClass} w-36`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td className="px-2 py-1.5 text-right text-xs uppercase tracking-wide text-slate-500">
                      Total
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-900">
                      {formatRupees(totals.amount)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                      {formatRupees(totals.gst)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {!splitMatches && (
              <p className="text-xs text-amber-600">
                Heads up: the amounts add up to {formatRupees(totals.amount)}, which differs
                from the PO value of {formatRupees(ctx.netPaise)}. That&apos;s fine if
                intentional.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {term && (
            <Button
              type="button"
              onClick={submit}
              disabled={isPending || rows.length === 0}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {isPending ? "Saving…" : `Create ${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SingleInvoiceDialog({
  ctx,
  siteId,
  onClose,
}: {
  ctx: PoInvoiceContext;
  siteId: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("raised");
  const [billedSiteId, setBilledSiteId] = useState(() => defaultBilledSite(ctx, siteId));
  const [isPending, startTransition] = useTransition();

  // Convenience: prefill GST from the PO's GST % when the amount changes and
  // the user hasn't typed a GST figure yet.
  function onAmountChange(v: string) {
    setAmount(v);
    if (!gstAmount && ctx.gstPercent) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        setGstAmount(((n * ctx.gstPercent) / 100).toFixed(2));
      }
    }
  }

  function submit() {
    startTransition(async () => {
      const result = await createSingleInvoice(ctx.poId, billedSiteId, siteId, {
        amountRupees: amount.trim() === "" ? 0 : Number(amount),
        gstNumber: gstNumber || null,
        gstAmountRupees: gstAmount.trim() === "" ? 0 : Number(gstAmount),
        issueDate: issueDate || null,
        dueDate: dueDate || null,
        status,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invoice created.");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add single invoice</DialogTitle>
          <DialogDescription>
            {ctx.poNumber}
            {ctx.poName ? ` · ${ctx.poName}` : ""} — a reference like HIPLA-INV-0001 is
            generated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <BillToField ctx={ctx} value={billedSiteId} onChange={setBilledSiteId} />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-amount">
                Amount (₹, ex-tax) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="inv-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-gst-amt">GST amount (₹)</Label>
              <Input
                id="inv-gst-amt"
                type="number"
                min="0"
                step="0.01"
                value={gstAmount}
                onChange={(e) => setGstAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-gst-no">GST number</Label>
            <Input
              id="inv-gst-no"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              placeholder="Recorded for the record, not computed"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-issue">Issue date</Label>
              <input
                id="inv-issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-due">Due date</Label>
              <input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-status">Status</Label>
              <select
                id="inv-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="raised">Raised</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isPending ? "Saving…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceActionsForPo({ ctx, siteId }: { ctx: PoInvoiceContext; siteId: string }) {
  const [open, setOpen] = useState<null | "generate" | "single">(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen("generate");
        }}
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        Generate invoices
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen("single");
        }}
        className="text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        Add single
      </button>
      {open === "generate" && (
        <GenerateDialog ctx={ctx} siteId={siteId} onClose={() => setOpen(null)} />
      )}
      {open === "single" && (
        <SingleInvoiceDialog ctx={ctx} siteId={siteId} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
