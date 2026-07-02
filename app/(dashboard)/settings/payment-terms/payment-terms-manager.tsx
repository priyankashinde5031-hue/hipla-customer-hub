"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  createPaymentTerm,
  updatePaymentTerm,
  setPaymentTermActive,
  type PaymentTermInput,
} from "./actions";

export type PaymentTermRow = {
  id: string;
  name: string;
  active: boolean;
  schedule_type: "periodic" | "milestone";
  invoices_per_year: number | null;
  timing: "advance" | "arrears";
  billing_schedule_days: number | null;
  installments: { label: string; percent: number }[];
};

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const FREQUENCY_PRESETS = [
  { label: "Monthly", value: 12 },
  { label: "Quarterly", value: 4 },
  { label: "Half-yearly", value: 2 },
  { label: "Annual", value: 1 },
];

function frequencyName(ipy: number | null): string {
  const hit = FREQUENCY_PRESETS.find((p) => p.value === ipy);
  return hit ? hit.label : ipy ? `${ipy}×/yr` : "—";
}

function scheduleSummary(t: PaymentTermRow): string {
  const due = t.billing_schedule_days != null ? ` · due ${t.billing_schedule_days}d` : "";
  if (t.schedule_type === "milestone") {
    const pcts = t.installments.map((i) => i.percent).join(" / ");
    return `Milestone · ${t.installments.length} stage${
      t.installments.length === 1 ? "" : "s"
    }${pcts ? ` (${pcts}%)` : ""}${due}`;
  }
  return `${frequencyName(t.invoices_per_year)} (${t.invoices_per_year}/yr) · ${t.timing}${due}`;
}

type MilestoneRow = { key: string; label: string; percent: string };
let mkey = 0;
function blankMilestone(): MilestoneRow {
  mkey += 1;
  return { key: `m${mkey}`, label: "", percent: "" };
}

function milestonesFromExisting(
  installments: { label: string; percent: number }[],
): MilestoneRow[] {
  if (!installments.length) return [blankMilestone()];
  return installments.map((i) => {
    mkey += 1;
    return { key: `e${mkey}`, label: i.label, percent: String(i.percent) };
  });
}

function PaymentTermDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: PaymentTermRow | null;
}) {
  const isEdit = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [scheduleType, setScheduleType] = useState<"periodic" | "milestone">(
    existing?.schedule_type ?? "periodic",
  );
  const [invoicesPerYear, setInvoicesPerYear] = useState(
    existing?.invoices_per_year != null ? String(existing.invoices_per_year) : "1",
  );
  const [timing, setTiming] = useState<"advance" | "arrears">(existing?.timing ?? "advance");
  const [billingDays, setBillingDays] = useState(
    existing?.billing_schedule_days != null ? String(existing.billing_schedule_days) : "0",
  );
  const [milestones, setMilestones] = useState<MilestoneRow[]>(
    milestonesFromExisting(existing?.installments ?? []),
  );
  const [isPending, startTransition] = useTransition();

  const percentTotal = useMemo(
    () =>
      milestones.reduce((sum, m) => {
        const p = Number(m.percent);
        return Number.isFinite(p) ? sum + p : sum;
      }, 0),
    [milestones],
  );

  function updateMilestone(key: string, patch: Partial<MilestoneRow>) {
    setMilestones((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function submit() {
    const input: PaymentTermInput = {
      name,
      scheduleType,
      invoicesPerYear: scheduleType === "periodic" ? Number(invoicesPerYear) : null,
      timing,
      billingScheduleDays: billingDays.trim() === "" ? null : Number(billingDays),
      installments:
        scheduleType === "milestone"
          ? milestones.map((m) => ({ label: m.label, percent: Number(m.percent) }))
          : [],
    };

    startTransition(async () => {
      const result = existing
        ? await updatePaymentTerm(existing.id, input)
        : await createPaymentTerm(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Payment term updated." : "Payment term added.");
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit payment term" : "Add payment term"}</DialogTitle>
          <DialogDescription>
            Define how a PO splits into invoices and how many days are allowed to clear.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pt-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Half-yearly advance"
            />
          </div>

          {/* Schedule type toggle */}
          <div className="flex flex-col gap-1.5">
            <Label>How does it split into invoices?</Label>
            <div className="flex gap-2">
              {(
                [
                  ["periodic", "Repeating (per year)"],
                  ["milestone", "Milestones (%)"],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setScheduleType(val)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    scheduleType === val
                      ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {scheduleType === "periodic" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ipy">Invoices per year</Label>
                <div className="flex flex-wrap gap-1.5">
                  {FREQUENCY_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setInvoicesPerYear(String(p.value))}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        Number(invoicesPerYear) === p.value
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <Input
                  id="ipy"
                  type="number"
                  min="1"
                  step="1"
                  value={invoicesPerYear}
                  onChange={(e) => setInvoicesPerYear(e.target.value)}
                  className="w-28"
                />
                <p className="text-xs text-slate-500">
                  Multiplied by the PO&apos;s contract length. e.g. 4/yr on a 1-year
                  contract = 4 invoices; on 2 years = 8.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timing">Billed at</Label>
                <select
                  id="timing"
                  value={timing}
                  onChange={(e) => setTiming(e.target.value as "advance" | "arrears")}
                  className={`${inputClass} w-44`}
                >
                  <option value="advance">Advance (start of period)</option>
                  <option value="arrears">Arrears (end of period)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Label>Milestone stages</Label>
                <span
                  className={`text-xs font-medium ${
                    Math.abs(percentTotal - 100) < 0.001 ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  Total: {percentTotal}%
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {milestones.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <input
                      value={m.label}
                      onChange={(e) => updateMilestone(m.key, { label: e.target.value })}
                      placeholder="Stage name, e.g. On go-live"
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={m.percent}
                      onChange={(e) => updateMilestone(m.key, { percent: e.target.value })}
                      placeholder="%"
                      className={`${inputClass} w-20 text-right`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones((ms) =>
                          ms.length > 1 ? ms.filter((x) => x.key !== m.key) : ms,
                        )
                      }
                      className="text-xs text-slate-400 hover:text-red-600"
                      aria-label="Remove stage"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setMilestones((ms) => [...ms, blankMilestone()])}
              >
                Add stage
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-days">Billing schedule — days to clear</Label>
            <Input
              id="billing-days"
              type="number"
              min="0"
              step="1"
              value={billingDays}
              onChange={(e) => setBillingDays(e.target.value)}
              className="w-28"
            />
            <p className="text-xs text-slate-500">
              Days after the invoice date by which payment is expected. Sets the due date.
            </p>
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
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add payment term"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentTermsManager({
  rows,
  canEdit,
}: {
  rows: PaymentTermRow[];
  canEdit: boolean;
}) {
  const [dialog, setDialog] = useState<PaymentTermRow | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleActive(t: PaymentTermRow) {
    startTransition(async () => {
      const result = await setPaymentTermActive(t.id, !t.active);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.active ? "Payment term deactivated." : "Payment term activated.");
    });
  }

  return (
    <div>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button
            className="h-9 gap-1.5 bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-700"
            onClick={() => setDialog("new")}
          >
            <Plus className="size-4" />
            Add payment term
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">Name</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Schedule
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</TableHead>
              {canEdit && <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} className={!t.active ? "opacity-50" : ""}>
                <TableCell className="font-medium text-slate-800">{t.name}</TableCell>
                <TableCell className="text-slate-600">{scheduleSummary(t)}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {t.active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <Button variant="ghost" size="sm" onClick={() => setDialog(t)}>
                        Edit
                      </Button>
                      <Switch
                        checked={t.active}
                        disabled={isPending}
                        onCheckedChange={() => toggleActive(t)}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            No payment terms yet{canEdit ? " — add the first one above." : "."}
          </p>
        )}
      </div>

      {dialog !== null && (
        <PaymentTermDialog
          open={dialog !== null}
          onClose={() => setDialog(null)}
          existing={dialog === "new" ? null : dialog}
        />
      )}
    </div>
  );
}
