"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/currency";
import { deviationPercent } from "@/lib/renewals";
import {
  updateRenewal,
  markRenewalDone,
  uploadRenewalAttachment,
} from "./renewal-actions";

export type RenewalCardData = {
  id: string;
  yearNumber: number;
  renewalDate: string | null; // computed from go-live; null = "—"
  expectedValuePaise: number | null;
  renewalValuePaise: number | null;
  renewalReceivedDate: string | null;
  paymentTerms: string | null;
  status: "upcoming" | "renewed";
  attachment: { filename: string; url: string | null } | null;
};

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function paiseToInput(paise: number | null): string {
  return paise === null || paise === undefined ? "" : String(paise / 100);
}

function RenewalCard({
  renewal,
  siteId,
  canEdit,
}: {
  renewal: RenewalCardData;
  siteId: string;
  canEdit: boolean;
}) {
  const [expected, setExpected] = useState(paiseToInput(renewal.expectedValuePaise));
  const [value, setValue] = useState(paiseToInput(renewal.renewalValuePaise));
  const [received, setReceived] = useState(renewal.renewalReceivedDate ?? "");
  const [terms, setTerms] = useState(renewal.paymentTerms ?? "");
  const [isSaving, startSave] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const isDone = renewal.status === "renewed";

  // Live deviation from whatever is currently typed.
  const expectedPaise = expected.trim() === "" ? 0 : Math.round(Number(expected) * 100);
  const valuePaise = value.trim() === "" ? null : Math.round(Number(value) * 100);
  const deviation = deviationPercent(valuePaise, expectedPaise);
  const deviationLabel =
    valuePaise === null || expectedPaise <= 0
      ? "—"
      : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%`;
  const deviationColor =
    valuePaise === null || expectedPaise <= 0
      ? "text-slate-500"
      : deviation >= 0
        ? "text-emerald-700"
        : "text-red-600";

  // Mark-as-done gate: both renewal value and received date present.
  const canMarkDone = value.trim() !== "" && received.trim() !== "";

  function save() {
    startSave(async () => {
      const result = await updateRenewal(renewal.id, siteId, {
        expectedValueRupees: expected.trim() === "" ? null : Number(expected),
        renewalValueRupees: value.trim() === "" ? null : Number(value),
        renewalReceivedDate: received || null,
        paymentTerms: terms || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Year ${renewal.yearNumber} saved.`);
    });
  }

  function markDone() {
    startSave(async () => {
      // Persist any unsaved edits first, then flip the status.
      const saved = await updateRenewal(renewal.id, siteId, {
        expectedValueRupees: expected.trim() === "" ? null : Number(expected),
        renewalValueRupees: value.trim() === "" ? null : Number(value),
        renewalReceivedDate: received || null,
        paymentTerms: terms || null,
      });
      if (saved.error) {
        toast.error(saved.error);
        return;
      }
      const result = await markRenewalDone(renewal.id, siteId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Year ${renewal.yearNumber} marked as renewed.`);
    });
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    const fd = new FormData();
    fd.set("renewalId", renewal.id);
    fd.set("siteId", siteId);
    fd.set("file", file);
    startUpload(async () => {
      const result = await uploadRenewalAttachment(fd);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("PO attached.");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium text-slate-900">Year {renewal.yearNumber}</span>
          <span className="text-sm text-slate-500">
            Renewal: {renewal.renewalDate ?? "—"}
          </span>
          <span className="text-sm text-slate-500">
            Expected: {formatPaise(renewal.expectedValuePaise ?? 0)}
          </span>
        </div>
        <span className="shrink-0">
          {isDone ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Renewed
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Upcoming
            </span>
          )}
        </span>
      </summary>

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Renewal date — read-only, computed */}
          <div className="flex flex-col gap-1.5">
            <Label>Renewal date</Label>
            <p className="flex h-8 items-center text-sm text-slate-700">
              {renewal.renewalDate ?? "—"}
            </p>
          </div>

          {/* Expected — editable projection baseline */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`exp-${renewal.id}`}>Expected renewal value (₹)</Label>
            <Input
              id={`exp-${renewal.id}`}
              type="number"
              min="0"
              step="0.01"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              disabled={!canEdit || isDone}
              placeholder="0"
            />
          </div>

          {/* Deviation — read-only, computed */}
          <div className="flex flex-col gap-1.5">
            <Label>Deviation from expected</Label>
            <p className={`flex h-8 items-center text-sm font-medium tabular-nums ${deviationColor}`}>
              {deviationLabel}
            </p>
          </div>

          {/* Renewal value — actual */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`val-${renewal.id}`}>
              Renewal value (₹) <span className="text-red-500">*</span>
            </Label>
            <Input
              id={`val-${renewal.id}`}
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!canEdit || isDone}
              placeholder="0"
            />
          </div>

          {/* Received date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rcv-${renewal.id}`}>
              Renewal received date <span className="text-red-500">*</span>
            </Label>
            <input
              id={`rcv-${renewal.id}`}
              type="date"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              disabled={!canEdit || isDone}
              className={inputClass}
            />
          </div>

          {/* Payment terms */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`terms-${renewal.id}`}>Payment terms</Label>
            <Input
              id={`terms-${renewal.id}`}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              disabled={!canEdit || isDone}
              placeholder="e.g., Net 30, 50% advance"
            />
          </div>
        </div>

        {/* PO attachment */}
        <div className="mt-4 flex flex-col gap-1.5">
          <Label>PO attachment</Label>
          <div className="flex flex-wrap items-center gap-3">
            {renewal.attachment ? (
              renewal.attachment.url ? (
                <a
                  href={renewal.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {renewal.attachment.filename}
                </a>
              ) : (
                <span className="text-sm text-slate-600">{renewal.attachment.filename}</span>
              )
            ) : (
              <span className="text-sm text-slate-400">No PO file attached.</span>
            )}
            {canEdit && (
              <span className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  className="text-sm text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-2 file:py-1 file:text-xs file:text-slate-700"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={upload}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading…" : "Upload"}
                </Button>
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {canEdit && !isDone && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={save}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={markDone}
              disabled={isSaving || !canMarkDone}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Mark renewal as done
            </Button>
            {!canMarkDone && (
              <span className="text-xs text-slate-400">
                (Fill Renewal Value &amp; Received Date)
              </span>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

export function RenewalsSection({
  renewals,
  siteId,
  canEdit,
  goLiveSet,
}: {
  renewals: RenewalCardData[];
  siteId: string;
  canEdit: boolean;
  goLiveSet: boolean;
}) {
  return (
    <div className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Renewals (Year 2–5 projections)
      </h2>

      {!goLiveSet && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set the Go Live Date in Implementation (Stage 4) to auto-calculate
          renewal dates for Year 2–5.
        </p>
      )}

      {renewals.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No renewals yet — they are generated automatically when a purchase
          order is created for this site.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {renewals.map((r) => (
            <RenewalCard key={r.id} renewal={r} siteId={siteId} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
