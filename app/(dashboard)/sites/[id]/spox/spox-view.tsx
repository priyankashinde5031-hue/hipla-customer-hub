"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Phone, Pencil, Trash2, UserMinus, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSpox,
  updateSpox,
  deactivateSpox,
  deleteSpox,
  type SpoxInput,
  type SpoxRole,
} from "../spox-actions";

export type TeamOption = { id: string; name: string };
export type StaffOption = { id: string; name: string };
export type SpoxRow = {
  id: string;
  name: string;
  role: SpoxRole;
  email: string | null;
  phone: string | null;
  designation: string | null;
  hasTakenTraining: boolean;
  internalOwnerTeamId: string;
  internalOwnerTeamName: string;
  internalOwnerUserId: string | null;
  internalOwnerUserName: string | null;
  status: "active" | "inactive";
  replacedById: string | null;
  replacedByName: string | null;
  leftAt: string | null;
};

const ROLE_META: { key: SpoxRole; label: string }[] = [
  { key: "decision_maker", label: "Decision Maker" },
  { key: "solution_approver", label: "Solution Approver" },
  { key: "middle_user_manager", label: "Middle User/Manager" },
  { key: "end_user", label: "End User" },
];
const ROLE_LABEL: Record<SpoxRole, string> = Object.fromEntries(
  ROLE_META.map((r) => [r.key, r.label]),
) as Record<SpoxRole, string>;

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type FormState = {
  name: string;
  role: SpoxRole;
  email: string;
  phone: string;
  designation: string;
  internalOwnerTeamId: string;
  internalOwnerUserId: string;
  hasTakenTraining: boolean;
};

function emptyForm(teams: TeamOption[], role: SpoxRole = "decision_maker"): FormState {
  return {
    name: "",
    role,
    email: "",
    phone: "",
    designation: "",
    internalOwnerTeamId: teams[0]?.id ?? "",
    internalOwnerUserId: "",
    hasTakenTraining: false,
  };
}

function toInput(form: FormState): SpoxInput {
  return {
    name: form.name,
    role: form.role,
    email: form.email || null,
    phone: form.phone || null,
    designation: form.designation || null,
    internalOwnerTeamId: form.internalOwnerTeamId,
    internalOwnerUserId: form.internalOwnerUserId || null,
    hasTakenTraining: form.hasTakenTraining,
  };
}

export function SpoxView({
  siteId,
  spox,
  teams,
  staff,
  canEdit,
}: {
  siteId: string;
  spox: SpoxRow[];
  teams: TeamOption[];
  staff: StaffOption[];
  canEdit: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SpoxRow | null>(null);
  const [deactivating, setDeactivating] = useState<SpoxRow | null>(null);
  const [deleting, setDeleting] = useState<SpoxRow | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const active = useMemo(() => spox.filter((s) => s.status === "active"), [spox]);
  const inactive = useMemo(() => spox.filter((s) => s.status === "inactive"), [spox]);

  const countByRole = (role: SpoxRole) => active.filter((s) => s.role === role).length;

  const handleCreate = (input: SpoxInput) => {
    startTransition(async () => {
      const res = await createSpox(siteId, input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Spox added.");
      setShowAdd(false);
      router.refresh();
    });
  };

  const handleUpdate = (id: string, input: SpoxInput) => {
    startTransition(async () => {
      const res = await updateSpox(id, siteId, input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Spox updated.");
      setEditing(null);
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteSpox(siteId, id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Spox deleted.");
      setDeleting(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Stat row — active count per role */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {ROLE_META.map((r) => (
          <div
            key={r.key}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {r.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              {countByRole(r.key)}
            </p>
          </div>
        ))}
      </div>

      {/* Add button + form */}
      {canEdit && !showAdd && !editing && (
        <Button onClick={() => setShowAdd(true)}>+ Add new Spox</Button>
      )}
      {canEdit && showAdd && (
        <SpoxForm
          title="Add new Spox"
          teams={teams}
          staff={staff}
          initial={emptyForm(teams)}
          submitLabel="Add Spox"
          pending={pending}
          onSubmit={handleCreate}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Role sections */}
      {ROLE_META.map((r) => {
        const rows = active.filter((s) => s.role === r.key);
        return (
          <section key={r.key}>
            <h2 className="text-lg font-serif font-semibold text-gray-900">{r.label}</h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-center text-sm italic text-slate-400">
                No Spox in this role
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {rows.map((s) =>
                  editing?.id === s.id ? (
                    <SpoxForm
                      key={s.id}
                      title="Edit Spox"
                      teams={teams}
                      staff={staff}
                      initial={{
                        name: s.name,
                        role: s.role,
                        email: s.email ?? "",
                        phone: s.phone ?? "",
                        designation: s.designation ?? "",
                        internalOwnerTeamId: s.internalOwnerTeamId,
                        internalOwnerUserId: s.internalOwnerUserId ?? "",
                        hasTakenTraining: s.hasTakenTraining,
                      }}
                      submitLabel="Save changes"
                      pending={pending}
                      onSubmit={(input) => handleUpdate(s.id, input)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <SpoxCard
                      key={s.id}
                      spox={s}
                      canEdit={canEdit}
                      onEdit={() => setEditing(s)}
                      onDeactivate={() => setDeactivating(s)}
                      onDelete={() => setDeleting(s)}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Former contacts (deactivated) — read-only history */}
      {inactive.length > 0 && (
        <section>
          <h2 className="text-lg font-serif font-semibold text-gray-900">Former contacts</h2>
          <div className="mt-3 space-y-2">
            {inactive.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-slate-50 p-4"
              >
                <div className="text-sm">
                  <span className="font-medium text-slate-700">{s.name}</span>
                  <span className="text-slate-400"> · {ROLE_LABEL[s.role]}</span>
                  {s.replacedByName && (
                    <span className="text-slate-500"> → replaced by {s.replacedByName}</span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => setDeleting(s)}
                    aria-label="Delete record"
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Replacement flow modal */}
      {deactivating && (
        <ReplacementDialog
          siteId={siteId}
          spox={deactivating}
          candidates={active.filter(
            (s) => s.id !== deactivating.id && s.role === deactivating.role,
          )}
          otherCandidates={active.filter(
            (s) => s.id !== deactivating.id && s.role !== deactivating.role,
          )}
          teams={teams}
          staff={staff}
          onClose={() => setDeactivating(null)}
        />
      )}

      {/* Delete confirm modal */}
      {deleting && (
        <ConfirmDialog
          title="Delete this Spox record?"
          body="This permanently removes the record and cannot be undone. Use this only for a mistaken entry — to record that someone left, use “Mark as left” instead."
          confirmLabel="Delete record"
          destructive
          pending={pending}
          onConfirm={() => handleDelete(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function SpoxCard({
  spox,
  canEdit,
  onEdit,
  onDeactivate,
  onDelete,
}: {
  spox: SpoxRow;
  canEdit: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
          {initials(spox.name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{spox.name}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {ROLE_LABEL[spox.role]}
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {spox.internalOwnerTeamName}
              {spox.internalOwnerUserName ? ` · ${spox.internalOwnerUserName}` : ""}
            </span>
            {spox.hasTakenTraining && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <GraduationCap className="size-3" /> Hipla training complete
              </span>
            )}
          </div>
          {spox.designation && (
            <p className="mt-1 text-sm text-slate-500">{spox.designation}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {spox.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" /> {spox.email}
              </span>
            )}
            {spox.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" /> {spox.phone}
              </span>
            )}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            aria-label="Edit"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDeactivate}
            aria-label="Mark as left"
            title="Mark as left"
            className="rounded p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          >
            <UserMinus className="size-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete record"
            title="Delete record"
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function SpoxForm({
  title,
  teams,
  staff,
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  title: string;
  teams: TeamOption[];
  staff: StaffOption[];
  initial: FormState;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: SpoxInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);

  const submit = () => {
    if (!form.name.trim()) return toast.error("Enter the contact's name.");
    if (!form.internalOwnerTeamId) return toast.error("Choose an internal owner team.");
    onSubmit(toInput(form));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <Input
            placeholder="John Doe"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="h-8"
          />
        </Field>
        <Field label="Role *">
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as SpoxRole }))}
            className={inputClass}
          >
            {ROLE_META.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email">
          <Input
            type="email"
            placeholder="john@company.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="h-8"
          />
        </Field>
        <Field label="Phone">
          <Input
            placeholder="+1 234 567 8900"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="h-8"
          />
        </Field>
        <Field label="Designation">
          <Input
            placeholder="Senior Manager"
            value={form.designation}
            onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
            className="h-8"
          />
        </Field>
        <Field label="Internal owner team *">
          <select
            value={form.internalOwnerTeamId}
            onChange={(e) => setForm((f) => ({ ...f, internalOwnerTeamId: e.target.value }))}
            className={inputClass}
          >
            {teams.length === 0 && <option value="">No teams available</option>}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner (specific person, optional)">
          <select
            value={form.internalOwnerUserId}
            onChange={(e) => setForm((f) => ({ ...f, internalOwnerUserId: e.target.value }))}
            className={inputClass}
          >
            <option value="">No specific person</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.hasTakenTraining}
          onChange={(e) => setForm((f) => ({ ...f, hasTakenTraining: e.target.checked }))}
          className="size-4 rounded border-slate-300"
        />
        Has taken Hipla training
      </label>
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ReplacementDialog({
  siteId,
  spox,
  candidates,
  otherCandidates,
  teams,
  staff,
  onClose,
}: {
  siteId: string;
  spox: SpoxRow;
  candidates: SpoxRow[]; // same role
  otherCandidates: SpoxRow[]; // other roles
  teams: TeamOption[];
  staff: StaffOption[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [addingNew, setAddingNew] = useState(candidates.length === 0 && otherCandidates.length === 0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirmExisting = () => {
    startTransition(async () => {
      const res = await deactivateSpox(siteId, spox.id, { replacementId: selected });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${spox.name} marked as left.`);
      onClose();
      router.refresh();
    });
  };

  const confirmNew = (input: SpoxInput) => {
    startTransition(async () => {
      const res = await deactivateSpox(siteId, spox.id, { newSpox: input });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${spox.name} marked as left, replacement added.`);
      onClose();
      router.refresh();
    });
  };

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg">
        <h3 className="text-lg font-serif font-semibold text-gray-900">
          Select a replacement Spox
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          You must select a replacement before marking{" "}
          <span className="font-medium text-slate-700">{spox.name}</span> (
          {ROLE_LABEL[spox.role]}) as left. Their record and contact details are kept.
        </p>

        {addingNew ? (
          <div className="mt-4">
            <SpoxForm
              title="Add Spox & set as replacement"
              teams={teams}
              staff={staff}
              initial={emptyForm(teams, spox.role)}
              submitLabel="Add Spox & set as replacement"
              pending={pending}
              onSubmit={confirmNew}
              onCancel={
                candidates.length === 0 && otherCandidates.length === 0
                  ? onClose
                  : () => setAddingNew(false)
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="replacement">Replacement</Label>
              <select
                id="replacement"
                value={selected}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setSelected("");
                    setAddingNew(true);
                  } else {
                    setSelected(e.target.value);
                  }
                }}
                className={inputClass}
              >
                <option value="">Select a Spox</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {ROLE_LABEL[c.role]}
                  </option>
                ))}
                {otherCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {ROLE_LABEL[c.role]}
                  </option>
                ))}
                <option value="__new__">+ Add new Spox…</option>
              </select>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={confirmExisting} disabled={pending || !selected}>
                {pending ? "Saving…" : "Confirm"}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
        <h3 className="text-lg font-serif font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{body}</p>
        <div className="mt-5 flex gap-2">
          <Button
            onClick={onConfirm}
            disabled={pending}
            className={destructive ? "bg-red-600 hover:bg-red-700" : undefined}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
