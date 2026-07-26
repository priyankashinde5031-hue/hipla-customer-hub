"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw } from "lucide-react";
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
import { addDevice, deleteDevice, replaceDevice } from "./device-actions";
import { formatDate, todayISO } from "@/lib/date";

export type ActiveDevice = {
  id: string;
  hardwareName: string;
  esperId: string;
  nameOnEsper: string;
  isReplacementUnit: boolean;
};

export type ReplacementRow = {
  id: string;
  oldHardwareName: string;
  oldEsperId: string;
  newEsperId: string;
  replacedAt: string;
  approverName: string;
  notes: string | null;
};

type Option = { id: string; name: string };

const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function HardwareSection({
  siteId,
  canEdit,
  activeDevices,
  replacements,
  hardwareOptions,
  approverOptions,
}: {
  siteId: string;
  canEdit: boolean;
  activeDevices: ActiveDevice[];
  replacements: ReplacementRow[];
  hardwareOptions: Option[];
  approverOptions: Option[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<ActiveDevice | "pick" | null>(
    null,
  );

  return (
    <section className="mt-6">
      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setReplaceTarget("pick")}
            disabled={activeDevices.length === 0}
          >
            <RefreshCw className="size-4" />
            Replace Device
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-4" />
            Add Hardware
          </Button>
        </div>
      )}

      {/* Summary cards (spec §4.2) */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        <CountCard label="Active devices" value={activeDevices.length} />
        <CountCard label="Replaced devices" value={replacements.length} />
      </div>

      {/* Hardware Provided — all active devices for this site (spec §4.1/§4.2) */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm [font-variant-numeric:tabular-nums]">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 font-medium">Hardware name</th>
              <th className="px-3 py-2 font-medium">Esper ID</th>
              <th className="px-3 py-2 font-medium">Name on Esper</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {canEdit && <th className="px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeDevices.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 5 : 4}
                  className="px-3 py-6 text-slate-400"
                >
                  No hardware recorded for this site yet
                  {canEdit ? " — add the first device above." : "."}
                </td>
              </tr>
            ) : (
              activeDevices.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-slate-700">{d.hardwareName}</td>
                  <td className="px-3 py-2 text-slate-700">{d.esperId}</td>
                  <td className="px-3 py-2 text-slate-700">{d.nameOnEsper}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Active
                    </span>
                    {d.isReplacementUnit && (
                      <span className="ml-2 text-xs text-slate-400">
                        (Replaced device)
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setReplaceTarget(d)}
                          className="rounded p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                          aria-label="Replace device"
                          title="Replace this device"
                        >
                          <RefreshCw className="size-4" />
                        </button>
                        <DeleteDeviceButton
                          device={d}
                          siteId={siteId}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Replacement History — append-only (spec §4.2) */}
      <h3 className="mt-6 text-sm font-medium text-gray-900">Replacement history</h3>
      {replacements.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">
          No devices have been replaced at this site yet.
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-sm [font-variant-numeric:tabular-nums]">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 font-medium">Old device</th>
                <th className="px-3 py-2 font-medium">Old Esper ID</th>
                <th className="px-3 py-2 font-medium">Replaced by (new Esper ID)</th>
                <th className="px-3 py-2 font-medium">Approved by</th>
                <th className="px-3 py-2 font-medium">Replaced on</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {replacements.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-700">
                    {r.oldHardwareName}
                    {r.notes && (
                      <span className="block text-xs text-slate-400">{r.notes}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.oldEsperId}</td>
                  <td className="px-3 py-2 text-slate-700">{r.newEsperId}</td>
                  <td className="px-3 py-2 text-slate-700">{r.approverName}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(r.replacedAt)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Replaced
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <>
          <AddHardwareDialog
            open={showAdd}
            onOpenChange={setShowAdd}
            siteId={siteId}
            hardwareOptions={hardwareOptions}
          />
          <ReplaceDeviceDialog
            target={replaceTarget}
            onClose={() => setReplaceTarget(null)}
            siteId={siteId}
            activeDevices={activeDevices}
            hardwareOptions={hardwareOptions}
            approverOptions={approverOptions}
          />
        </>
      )}
    </section>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function DeleteDeviceButton({
  device,
  siteId,
}: {
  device: ActiveDevice;
  siteId: string;
}) {
  const [pending, startTransition] = useTransition();
  // A replacement unit carries history, so it can never be hard-deleted
  // (spec rule 6) — disable and explain on hover.
  const blocked = device.isReplacementUnit;

  const remove = () => {
    if (!confirm(`Delete "${device.hardwareName}" (${device.esperId})?`)) return;
    startTransition(async () => {
      const res = await deleteDevice(device.id, siteId);
      if (res.error) toast.error(res.error);
      else toast.success("Device deleted.");
    });
  };

  return (
    <button
      onClick={remove}
      disabled={pending || blocked}
      aria-label="Delete device"
      title={
        blocked
          ? "This device has replacement history and can't be deleted"
          : "Delete device"
      }
      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function AddHardwareDialog({
  open,
  onOpenChange,
  siteId,
  hardwareOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  hardwareOptions: Option[];
}) {
  const [form, setForm] = useState({ hardwareCatalogId: "", esperId: "", nameOnEsper: "" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setForm({ hardwareCatalogId: "", esperId: "", nameOnEsper: "" });
    setFieldError(null);
  };

  const submit = () => {
    setFieldError(null);
    if (!form.hardwareCatalogId) return toast.error("Choose a hardware name.");
    if (!form.esperId.trim()) {
      setFieldError("Enter the Esper ID.");
      return;
    }
    if (!form.nameOnEsper.trim()) return toast.error("Enter the name on Esper.");

    startTransition(async () => {
      const res = await addDevice(siteId, {
        hardwareCatalogId: form.hardwareCatalogId,
        esperId: form.esperId,
        nameOnEsper: form.nameOnEsper,
      });
      if (res.error) {
        if (res.field === "esperId") setFieldError(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success("Hardware added.");
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add hardware</DialogTitle>
          <DialogDescription>
            Record a brand-new device installed at this site.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-hw-name">
              Hardware name <span className="text-red-500">*</span>
            </Label>
            <select
              id="add-hw-name"
              value={form.hardwareCatalogId}
              onChange={(e) => setForm((f) => ({ ...f, hardwareCatalogId: e.target.value }))}
              className={selectClass}
            >
              <option value="">Choose hardware</option>
              {hardwareOptions.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-hw-esper">
              Esper ID <span className="text-red-500">*</span>
            </Label>
            <Input
              id="add-hw-esper"
              value={form.esperId}
              onChange={(e) => {
                setForm((f) => ({ ...f, esperId: e.target.value }));
                if (fieldError) setFieldError(null);
              }}
              aria-invalid={Boolean(fieldError)}
            />
            {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-hw-nameon">
              Name on Esper <span className="text-red-500">*</span>
            </Label>
            <Input
              id="add-hw-nameon"
              value={form.nameOnEsper}
              onChange={(e) => setForm((f) => ({ ...f, nameOnEsper: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {pending ? "Adding…" : "Add hardware"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceDeviceDialog({
  target,
  onClose,
  siteId,
  activeDevices,
  hardwareOptions,
  approverOptions,
}: {
  target: ActiveDevice | "pick" | null;
  onClose: () => void;
  siteId: string;
  activeDevices: ActiveDevice[];
  hardwareOptions: Option[];
  approverOptions: Option[];
}) {
  const open = target !== null;
  // When opened from a specific row, pre-select that device; otherwise ("pick")
  // let the user choose.
  const presetOldId = target && target !== "pick" ? target.id : "";

  const [oldDeviceId, setOldDeviceId] = useState(presetOldId);
  const [form, setForm] = useState({
    hardwareCatalogId: "",
    esperId: "",
    nameOnEsper: "",
    approvedBy: "",
    replacedAt: todayISO(),
    notes: "",
  });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Re-sync the preset when the dialog is re-opened for a different row.
  const [lastTargetKey, setLastTargetKey] = useState<string | null>(null);
  const targetKey = target === null ? null : target === "pick" ? "pick" : target.id;
  if (targetKey !== lastTargetKey) {
    setLastTargetKey(targetKey);
    setOldDeviceId(presetOldId);
    setForm({
      hardwareCatalogId: "",
      esperId: "",
      nameOnEsper: "",
      approvedBy: "",
      replacedAt: todayISO(),
      notes: "",
    });
    setFieldError(null);
  }

  const submit = () => {
    setFieldError(null);
    if (!oldDeviceId) return toast.error("Choose the device to replace.");
    if (!form.hardwareCatalogId) return toast.error("Choose a hardware name.");
    if (!form.esperId.trim()) {
      setFieldError("Enter the Esper ID.");
      return;
    }
    if (!form.nameOnEsper.trim()) return toast.error("Enter the name on Esper.");
    if (!form.replacedAt) return toast.error("Choose the replacement date.");
    if (!form.approvedBy) return toast.error("Choose an approver.");

    startTransition(async () => {
      const res = await replaceDevice(siteId, {
        oldDeviceId,
        hardwareCatalogId: form.hardwareCatalogId,
        esperId: form.esperId,
        nameOnEsper: form.nameOnEsper,
        approvedBy: form.approvedBy,
        replacedAt: form.replacedAt || null,
        notes: form.notes || null,
      });
      if (res.error) {
        if (res.field === "esperId") setFieldError(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success("Device replaced.");
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace device</DialogTitle>
          <DialogDescription>
            Retire the old unit and record the new one. The old device moves to
            replacement history.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rep-old">
              Select hardware to replace <span className="text-red-500">*</span>
            </Label>
            <select
              id="rep-old"
              value={oldDeviceId}
              onChange={(e) => setOldDeviceId(e.target.value)}
              className={selectClass}
            >
              <option value="">Choose device</option>
              {activeDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hardwareName} – {d.esperId} – {d.nameOnEsper}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              New hardware details
            </p>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rep-hw">
                  Hardware name <span className="text-red-500">*</span>
                </Label>
                <select
                  id="rep-hw"
                  value={form.hardwareCatalogId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hardwareCatalogId: e.target.value }))
                  }
                  className={selectClass}
                >
                  <option value="">Choose hardware</option>
                  {hardwareOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rep-esper">
                  Esper ID <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="rep-esper"
                  value={form.esperId}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, esperId: e.target.value }));
                    if (fieldError) setFieldError(null);
                  }}
                  aria-invalid={Boolean(fieldError)}
                />
                {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rep-nameon">
                  Name on Esper <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="rep-nameon"
                  value={form.nameOnEsper}
                  onChange={(e) => setForm((f) => ({ ...f, nameOnEsper: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rep-date">
              Replacement date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="rep-date"
              type="date"
              value={form.replacedAt}
              max={todayISO()}
              onChange={(e) => setForm((f) => ({ ...f, replacedAt: e.target.value }))}
            />
            <p className="text-xs text-slate-400">Defaults to today. Change it if the swap happened earlier.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rep-approver">
              Approver <span className="text-red-500">*</span>
            </Label>
            <select
              id="rep-approver"
              value={form.approvedBy}
              onChange={(e) => setForm((f) => ({ ...f, approvedBy: e.target.value }))}
              className={selectClass}
            >
              <option value="">Choose approver</option>
              {approverOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {approverOptions.length === 0 && (
              <p className="text-xs text-amber-600">
                No staff to approve yet — add users in Settings → Users.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rep-notes">Notes (optional)</Label>
            <textarea
              id="rep-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Reason for replacement, RMA reference, etc."
              className="min-h-16 rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {pending ? "Replacing…" : "Replace Device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
