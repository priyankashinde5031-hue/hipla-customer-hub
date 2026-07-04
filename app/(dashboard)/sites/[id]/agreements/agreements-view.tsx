"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/date";
import { createAgreement, deleteAgreement } from "./agreement-actions";

export type AgreementRow = {
  id: string;
  signedDate: string;
  typeName: string | null;
  signedByName: string | null;
  attachment: { filename: string; url: string | null } | null;
};

export type AgreementTypeOption = { id: string; name: string };
export type UserOption = { id: string; name: string };

const inputClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// Files upload through a Server Action (see agreement-actions). Keep this under
// both Next's configured body limit (next.config: 5 MB) and Vercel's ~4.5 MB
// platform request cap, with headroom for form overhead.
const MAX_FILE_MB = 4;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AgreementsView({
  siteId,
  agreements,
  canEdit,
  agreementTypes,
  users,
}: {
  siteId: string;
  agreements: AgreementRow[];
  canEdit: boolean;
  agreementTypes: AgreementTypeOption[];
  users: UserOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {agreements.length === 0
            ? "No agreements stored for this site yet."
            : `${agreements.length} agreement${agreements.length === 1 ? "" : "s"} on file.`}
        </p>
        {canEdit && (
          <Button
            size="sm"
            className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" />
            Add Agreement
          </Button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm [font-variant-numeric:tabular-nums]">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Signed date</th>
              <th className="px-3 py-2 font-medium">Signed by</th>
              <th className="px-3 py-2 font-medium">File</th>
              {canEdit && <th className="px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agreements.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-3 py-6 text-slate-400">
                  No agreements stored for this site yet
                  {canEdit ? " — add the first one above." : "."}
                </td>
              </tr>
            ) : (
              agreements.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-slate-700">{a.typeName || "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(a.signedDate)}</td>
                  <td className="px-3 py-2 text-slate-700">{a.signedByName || "—"}</td>
                  <td className="px-3 py-2">
                    {a.attachment ? (
                      a.attachment.url ? (
                        <a
                          href={a.attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          <FileText className="size-4" />
                          {a.attachment.filename}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <FileText className="size-4" />
                          {a.attachment.filename}
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end">
                        <DeleteAgreementButton agreement={a} siteId={siteId} />
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <AddAgreementDialog
          key={open ? "open" : "closed"}
          open={open}
          onClose={() => setOpen(false)}
          siteId={siteId}
          agreementTypes={agreementTypes}
          users={users}
        />
      )}
    </section>
  );
}

function DeleteAgreementButton({
  agreement,
  siteId,
}: {
  agreement: AgreementRow;
  siteId: string;
}) {
  const [pending, startTransition] = useTransition();

  const remove = () => {
    const label = agreement.typeName ? `this ${agreement.typeName}` : "this agreement";
    if (!confirm(`Delete ${label}?`)) return;
    startTransition(async () => {
      const res = await deleteAgreement(siteId, agreement.id);
      if (res.error) toast.error(res.error);
      else toast.success("Agreement deleted.");
    });
  };

  return (
    <button
      onClick={remove}
      disabled={pending}
      aria-label="Delete agreement"
      title="Delete agreement"
      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function AddAgreementDialog({
  open,
  onClose,
  siteId,
  agreementTypes,
  users,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  agreementTypes: AgreementTypeOption[];
  users: UserOption[];
}) {
  const [form, setForm] = useState({
    signedDate: today(),
    agreementTypeId: "",
    signedById: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!form.signedDate) return toast.error("Pick the date the agreement was signed.");
    if (!form.agreementTypeId) return toast.error("Choose an agreement type.");
    const file = fileRef.current?.files?.[0];
    if (!file || file.size === 0) return toast.error("Attach the agreement file.");
    if (file.size > MAX_FILE_BYTES) {
      return toast.error(
        `That file is too large (max ${MAX_FILE_MB} MB). Please upload a smaller file.`,
      );
    }

    const data = new FormData();
    data.set("siteId", siteId);
    data.set("signedDate", form.signedDate);
    data.set("agreementTypeId", form.agreementTypeId);
    data.set("signedById", form.signedById);
    data.set("file", file);

    startTransition(async () => {
      const res = await createAgreement(data);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Agreement added.");
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Agreement</DialogTitle>
          <DialogDescription>
            Store a signed agreement for this site.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ag-date">
                Agreement signed date <span className="text-red-500">*</span>
              </Label>
              <input
                id="ag-date"
                type="date"
                max={today()}
                value={form.signedDate}
                onChange={(e) => setForm((f) => ({ ...f, signedDate: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ag-type">
                Agreement type <span className="text-red-500">*</span>
              </Label>
              <select
                id="ag-type"
                value={form.agreementTypeId}
                onChange={(e) => setForm((f) => ({ ...f, agreementTypeId: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select a type…</option>
                {agreementTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ag-file">
              Attach agreement file <span className="text-red-500">*</span>
            </Label>
            <input
              id="ag-file"
              ref={fileRef}
              type="file"
              className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <p className="text-xs text-slate-400">PDF or image, up to {MAX_FILE_MB} MB.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ag-signer">Agreement signed by</Label>
            <select
              id="ag-signer"
              value={form.signedById}
              onChange={(e) => setForm((f) => ({ ...f, signedById: e.target.value }))}
              className={inputClass}
            >
              <option value="">Not recorded</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
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
            {pending ? "Saving…" : "Save Agreement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
