"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Trash2, Check, Ban, X, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/date";
import {
  createScopeChange,
  setScopeChangeStatus,
  deleteScopeChange,
  type ScopeChangeInput,
  type ScopeChangeStatus,
} from "./scope-changes-actions";

export type ApproverOption = { id: string; name: string };

export type ScopeChangeRow = {
  id: string;
  description: string;
  changeDate: string; // YYYY-MM-DD
  impact: string | null;
  approverId: string;
  approverName: string | null;
  status: ScopeChangeStatus;
  createdByName: string | null;
  createdAt: string; // ISO timestamp
};

const STATUS_META: Record<
  ScopeChangeStatus,
  { label: string; badge: string }
> = {
  pending: { label: "Pending", badge: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", badge: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", badge: "bg-red-50 text-red-700" },
};

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── The Site 360 card. Opens the modal; styled to match the sibling cards
// (Spox / Hardware / Usage) rather than introducing a new recipe. ────────────
export function ScopeChangesCard({
  siteId,
  scopeChanges,
  approvers,
  canEdit,
  id,
}: {
  siteId: string;
  scopeChanges: ScopeChangeRow[];
  approvers: ApproverOption[];
  canEdit: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const total = scopeChanges.length;
  const pending = scopeChanges.filter((s) => s.status === "pending").length;

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="scroll-mt-24 block w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
      >
        <h3 className="text-sm font-medium text-gray-900">Scope Changes</h3>
        <p className="mt-1 text-sm text-slate-500">
          {total === 0
            ? "Track and manage changes to this site's delivery scope."
            : `${total} change${total === 1 ? "" : "s"}${
                pending > 0 ? ` · ${pending} pending` : ""
              }`}
        </p>
        <p className="mt-3 text-xs font-medium text-indigo-600">
          Open scope changes →
        </p>
      </button>

      {open && (
        <ScopeChangesModal
          siteId={siteId}
          scopeChanges={scopeChanges}
          approvers={approvers}
          canEdit={canEdit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ScopeChangesModal({
  siteId,
  scopeChanges,
  approvers,
  canEdit,
  onClose,
}: {
  siteId: string;
  scopeChanges: ScopeChangeRow[];
  approvers: ApproverOption[];
  canEdit: boolean;
  onClose: () => void;
}) {
  // Reverse-chronological (newest first) for the timeline.
  const ordered = useMemo(
    () =>
      [...scopeChanges].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [scopeChanges],
  );
  const total = ordered.length;
  const lastUpdatedIso = ordered[0]?.createdAt ?? null;
  const lastUpdated = lastUpdatedIso
    ? formatDate(lastUpdatedIso.slice(0, 10))
    : "N/A";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-auto w-full max-w-3xl rounded-xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Scope Changes"
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h2 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
              Scope Changes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Track and manage project scope modifications
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Summary stat card — derived, not editable. Recomputed from the
              list on every add/status change/delete (router.refresh). */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
                Total Scope Changes
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">
                {total}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
                Last Updated
              </p>
              <p className="mt-1 text-sm font-medium tabular-nums text-slate-700">
                {lastUpdated}
              </p>
            </div>
          </div>

          {canEdit && (
            <ScopeChangeForm
              siteId={siteId}
              approvers={approvers}
              onSaved={onClose}
            />
          )}

          <div>
            <h3 className="text-lg font-serif font-semibold text-gray-900">
              Changes Timeline
            </h3>
            {ordered.length === 0 ? (
              <EmptyTimeline />
            ) : (
              <div className="mt-3 space-y-2">
                {ordered.map((sc) => (
                  <ScopeChangeItem
                    key={sc.id}
                    siteId={siteId}
                    row={sc}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyTimeline() {
  return (
    <div className="mt-3 flex flex-col items-center gap-1 rounded-xl border border-dashed border-gray-200 py-10 text-center">
      <ClipboardList className="mb-2 size-6 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">
        No scope changes recorded
      </p>
      <p className="text-xs text-slate-400">
        Add your first scope change to start tracking
      </p>
    </div>
  );
}

type FormState = {
  description: string;
  changeDate: string;
  impact: string;
  approverId: string;
};

function emptyForm(): FormState {
  return { description: "", changeDate: todayIso(), impact: "", approverId: "" };
}

function ScopeChangeForm({
  siteId,
  approvers,
  onSaved,
}: {
  siteId: string;
  approvers: ApproverOption[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const canSubmit = form.description.trim().length > 0 && !!form.approverId;

  const submit = () => {
    if (!form.description.trim()) return toast.error("Describe the scope change.");
    if (!form.approverId) return toast.error("Select an approver.");
    const input: ScopeChangeInput = {
      description: form.description,
      changeDate: form.changeDate || null,
      impact: form.impact || null,
      approverId: form.approverId,
    };
    startTransition(async () => {
      const res = await createScopeChange(siteId, input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Scope change submitted.");
      setForm(emptyForm());
      onSaved();
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-900">
        Add New Scope Change Request
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>
            Description <span className="text-red-600">*</span>
          </Label>
          <textarea
            placeholder="Describe the scope change..."
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={3}
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Date</Label>
          <Input
            type="date"
            value={form.changeDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, changeDate: e.target.value }))
            }
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Impact</Label>
          <Input
            placeholder="e.g., Timeline +2 weeks"
            value={form.impact}
            onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value }))}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>
            Select Approver <span className="text-red-600">*</span>
          </Label>
          <select
            value={form.approverId}
            onChange={(e) =>
              setForm((f) => ({ ...f, approverId: e.target.value }))
            }
            className={inputClass}
          >
            <option value="">Select an approver</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={pending || !canSubmit}>
          <Mail className="size-4" />
          {pending ? "Submitting…" : "Submit for approval"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setForm(emptyForm())}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ScopeChangeItem({
  siteId,
  row,
  canEdit,
}: {
  siteId: string;
  row: ScopeChangeRow;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const meta = STATUS_META[row.status];

  const decide = (status: ScopeChangeStatus) => {
    startTransition(async () => {
      const res = await setScopeChangeStatus(siteId, row.id, status);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "approved" ? "Scope change approved." : "Scope change rejected.");
      router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const res = await deleteScopeChange(siteId, row.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Scope change removed.");
      router.refresh();
    });
  };

  const longDescription = row.description.length > 140;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-sm text-gray-900 ${
              longDescription && !expanded ? "line-clamp-2" : ""
            }`}
          >
            {row.description}
          </p>
          {longDescription && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="tabular-nums">{formatDate(row.changeDate)}</span>
        {row.impact && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {row.impact}
          </span>
        )}
        <span>
          Approver:{" "}
          <span className="font-medium text-slate-700">
            {row.approverName ?? "—"}
          </span>
        </span>
        {row.createdByName && <span>Requested by {row.createdByName}</span>}
      </div>

      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          {row.status === "pending" && (
            <>
              <Button
                variant="outline"
                onClick={() => decide("approved")}
                disabled={pending}
                className="h-7 px-2 text-xs"
              >
                <Check className="size-3.5" /> Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => decide("rejected")}
                disabled={pending}
                className="h-7 px-2 text-xs"
              >
                <Ban className="size-3.5" /> Reject
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Remove scope change"
            title="Remove"
            className="ml-auto rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
