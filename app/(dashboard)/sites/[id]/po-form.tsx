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
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  type PoFormInput,
} from "./po-actions";

type Option = { id: string; name: string };

export type ExistingPo = {
  id: string;
  po_number: string;
  name: string | null;
  po_type_id: string | null;
  cost_type_id: string | null;
  po_received_date: string | null;
  financial_year: string | null;
  gst_percent: number | null;
  payment_terms: string | null;
  site_ids: string[];
  module_ids: string[];
  line_items: { description: string; qty: number; unit_price_paise: number }[];
};

type LineRow = { key: string; description: string; qty: string; unitPrice: string };

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

let rowCounter = 0;
function blankRow(): LineRow {
  rowCounter += 1;
  return { key: `r${rowCounter}`, description: "", qty: "1", unitPrice: "" };
}

function rowsFromExisting(po: ExistingPo): LineRow[] {
  if (!po.line_items.length) return [blankRow()];
  return po.line_items.map((li) => {
    rowCounter += 1;
    return {
      key: `e${rowCounter}`,
      description: li.description,
      qty: String(li.qty),
      unitPrice: String(li.unit_price_paise / 100),
    };
  });
}

function PoFormDialog({
  open,
  onClose,
  organizationId,
  siteId,
  poTypeOptions,
  costTypeOptions,
  moduleOptions,
  siteOptions,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  siteId: string;
  poTypeOptions: Option[];
  costTypeOptions: Option[];
  moduleOptions: Option[];
  siteOptions: Option[];
  existing: ExistingPo | null;
}) {
  const isEdit = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [poTypeId, setPoTypeId] = useState(existing?.po_type_id ?? "");
  const [costTypeId, setCostTypeId] = useState(existing?.cost_type_id ?? "");
  const [poDate, setPoDate] = useState(existing?.po_received_date ?? "");
  const [financialYear, setFinancialYear] = useState(existing?.financial_year ?? "");
  const [gstPercent, setGstPercent] = useState(
    existing?.gst_percent != null ? String(existing.gst_percent) : "",
  );
  const [paymentTerms, setPaymentTerms] = useState(existing?.payment_terms ?? "");
  const [siteIds, setSiteIds] = useState<string[]>(
    existing ? existing.site_ids : [siteId], // default-cover the site we came from
  );
  const [moduleIds, setModuleIds] = useState<string[]>(existing?.module_ids ?? []);
  const [rows, setRows] = useState<LineRow[]>(
    existing ? rowsFromExisting(existing) : [blankRow()],
  );
  const [isPending, startTransition] = useTransition();

  const totalPaise = useMemo(() => {
    return rows.reduce((sum, r) => {
      const qty = Number(r.qty);
      const price = Number(r.unitPrice);
      if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) {
        return sum;
      }
      return sum + Math.round(qty * Math.round(price * 100));
    }, 0);
  }, [rows]);

  const gstAmountPaise = useMemo(() => {
    const pct = Number(gstPercent);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return Math.round((totalPaise * pct) / 100);
  }, [totalPaise, gstPercent]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    const input: PoFormInput = {
      name,
      poTypeId: poTypeId || null,
      costTypeId: costTypeId || null,
      poReceivedDate: poDate || null,
      financialYear: financialYear || null,
      gstPercent: gstPercent.trim() === "" ? null : Number(gstPercent),
      paymentTerms: paymentTerms || null,
      siteIds,
      moduleIds,
      lineItems: rows.map((r) => ({
        description: r.description,
        qty: Number(r.qty),
        unitPriceRupees: r.unitPrice.trim() === "" ? 0 : Number(r.unitPrice),
      })),
    };

    startTransition(async () => {
      const result = existing
        ? await updatePurchaseOrder(existing.id, siteId, input)
        : await createPurchaseOrder(organizationId, siteId, input);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isEdit
          ? "Purchase order updated."
          : `Purchase order ${result.poNumber} created.`,
      );
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit purchase order" : "Add purchase order"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Reference ${existing!.po_number}. The PO total is calculated from the line items.`
              : "A reference like HIPLA-PO-0001 is generated automatically when you save."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Basics */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-name">
              PO name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="po-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme HQ — VMS annual subscription"
            />
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-type">PO type</Label>
              <select
                id="po-type"
                value={poTypeId}
                onChange={(e) => setPoTypeId(e.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {poTypeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cost-type">Cost type</Label>
              <select
                id="cost-type"
                value={costTypeId}
                onChange={(e) => setCostTypeId(e.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {costTypeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-date">PO date</Label>
              <input
                id="po-date"
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fy">Financial year</Label>
              <Input
                id="fy"
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                placeholder="FY2025-26"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gst">GST %</Label>
              <Input
                id="gst"
                type="number"
                min="0"
                step="0.01"
                value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)}
                placeholder="18"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="terms">Payment terms</Label>
              <Input
                id="terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Net 30"
              />
            </div>
          </div>

          {/* Modules (multi-select) */}
          <div className="flex flex-col gap-1.5">
            <Label>Modules covered</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 p-2.5">
              {moduleOptions.length === 0 && (
                <p className="text-xs text-slate-400">No active modules.</p>
              )}
              {moduleOptions.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={moduleIds.includes(m.id)}
                    onChange={() => toggle(moduleIds, setModuleIds, m.id)}
                    className="size-3.5 rounded border-slate-300"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>

          {/* Covered sites (multi-select) */}
          <div className="flex flex-col gap-1.5">
            <Label>
              Covered sites <span className="text-red-500">*</span>
            </Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 p-2.5">
              {siteOptions.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={siteIds.includes(s.id)}
                    onChange={() => toggle(siteIds, setSiteIds, s.id)}
                    className="size-3.5 rounded border-slate-300"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          {/* Line items */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>
                Line items <span className="text-red-500">*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((rs) => [...rs, blankRow()])}
              >
                Add line item
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Description</th>
                    <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-2 py-1.5 text-right font-medium">Unit price (₹)</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const qty = Number(r.qty);
                    const price = Number(r.unitPrice);
                    const valid =
                      Number.isFinite(qty) && qty > 0 && Number.isFinite(price) && price >= 0;
                    const amount = valid ? Math.round(qty * Math.round(price * 100)) : 0;
                    return (
                      <tr key={r.key}>
                        <td className="px-2 py-1">
                          <input
                            value={r.description}
                            onChange={(e) => updateRow(r.key, { description: e.target.value })}
                            placeholder="What is being purchased"
                            className={`${inputClass} w-full`}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.qty}
                            onChange={(e) => updateRow(r.key, { qty: e.target.value })}
                            className={`${inputClass} w-20 text-right`}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={r.unitPrice}
                            onChange={(e) => updateRow(r.key, { unitPrice: e.target.value })}
                            className={`${inputClass} w-32 text-right`}
                          />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {formatRupees(amount)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setRows((rs) =>
                                rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs,
                              )
                            }
                            className="text-xs text-slate-400 hover:text-red-600"
                            aria-label="Remove line item"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-2 pt-2 text-right text-xs uppercase tracking-wide text-slate-500">
                      Subtotal (goods)
                    </td>
                    <td className="px-2 pt-2 text-right tabular-nums text-slate-600">
                      {formatRupees(totalPaise)}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-2 text-right text-xs uppercase tracking-wide text-slate-500">
                      GST{gstAmountPaise > 0 || gstPercent.trim() ? ` (${gstPercent || "0"}%)` : ""}
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-600">
                      {formatRupees(gstAmountPaise)}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-2 pb-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                      PO total (computed)
                    </td>
                    <td className="px-2 pb-2 text-right font-semibold tabular-nums text-slate-900">
                      {formatRupees(totalPaise + gstAmountPaise)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
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
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SharedProps = {
  organizationId: string;
  siteId: string;
  poTypeOptions: Option[];
  costTypeOptions: Option[];
  moduleOptions: Option[];
  siteOptions: Option[];
};

export function AddPoButton(props: SharedProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="bg-indigo-600 text-white hover:bg-indigo-700"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Add PO
      </Button>
      {open && (
        <PoFormDialog
          open={open}
          onClose={() => setOpen(false)}
          existing={null}
          {...props}
        />
      )}
    </>
  );
}

export function EditPoButton({ po, ...props }: SharedProps & { po: ExistingPo }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        Edit
      </button>
      {open && (
        <PoFormDialog
          open={open}
          onClose={() => setOpen(false)}
          existing={po}
          {...props}
        />
      )}
    </>
  );
}
