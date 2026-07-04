"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { formatDate } from "@/lib/date";
import {
  createSupportTicket,
  updateSupportTicket,
  deleteSupportTicket,
  type SupportTicketInput,
} from "./support-actions";

export type SupportTicketRow = {
  id: string;
  ticketRef: string | null;
  subject: string;
  openedDate: string;
  closedDate: string | null;
};

// Status is derived, never stored: open until it has a close date.
const isOpen = (t: SupportTicketRow) => !t.closedDate;

export function SupportView({
  siteId,
  tickets,
  canEdit,
}: {
  siteId: string;
  tickets: SupportTicketRow[];
  canEdit: boolean;
}) {
  // null = closed dialog; "new" = logging; a row = editing that ticket.
  const [dialog, setDialog] = useState<SupportTicketRow | "new" | null>(null);

  const openCount = tickets.filter(isOpen).length;
  const closedCount = tickets.length - openCount;

  return (
    <section className="mt-6">
      {canEdit && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => setDialog("new")}
          >
            <Plus className="size-4" />
            Log Support Ticket
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-lg">
        <CountCard label="Total tickets" value={tickets.length} />
        <CountCard label="Open" value={openCount} />
        <CountCard label="Closed" value={closedCount} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm [font-variant-numeric:tabular-nums]">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 font-medium">Ticket ID</th>
              <th className="px-3 py-2 font-medium">Ticket about</th>
              <th className="px-3 py-2 font-medium">Opened</th>
              <th className="px-3 py-2 font-medium">Closed</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {canEdit && <th className="px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-3 py-6 text-slate-400">
                  No support tickets logged for this site yet
                  {canEdit ? " — log the first one above." : "."}
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-slate-700">{t.ticketRef || "—"}</td>
                  <td className="max-w-sm px-3 py-2 text-slate-700">{t.subject}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(t.openedDate)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatDate(t.closedDate)}</td>
                  <td className="px-3 py-2">
                    {isOpen(t) ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Open
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Closed
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setDialog(t)}
                          className="rounded p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                          aria-label="Edit ticket"
                          title="Edit ticket"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <DeleteTicketButton ticket={t} siteId={siteId} />
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
        <TicketDialog
          key={dialog === null ? "closed" : dialog === "new" ? "new" : dialog.id}
          target={dialog}
          onClose={() => setDialog(null)}
          siteId={siteId}
        />
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

function DeleteTicketButton({
  ticket,
  siteId,
}: {
  ticket: SupportTicketRow;
  siteId: string;
}) {
  const [pending, startTransition] = useTransition();

  const remove = () => {
    const label = ticket.ticketRef ? `ticket ${ticket.ticketRef}` : "this ticket";
    if (!confirm(`Delete ${label}?`)) return;
    startTransition(async () => {
      const res = await deleteSupportTicket(siteId, ticket.id);
      if (res.error) toast.error(res.error);
      else toast.success("Ticket deleted.");
    });
  };

  return (
    <button
      onClick={remove}
      disabled={pending}
      aria-label="Delete ticket"
      title="Delete ticket"
      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

const dateInputClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function TicketDialog({
  target,
  onClose,
  siteId,
}: {
  target: SupportTicketRow | "new" | null;
  onClose: () => void;
  siteId: string;
}) {
  const open = target !== null;
  const editing = target !== null && target !== "new";

  const [form, setForm] = useState({
    ticketRef: editing ? target.ticketRef ?? "" : "",
    subject: editing ? target.subject : "",
    openedDate: editing ? target.openedDate : today(),
    closedDate: editing ? target.closedDate ?? "" : "",
  });
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!form.subject.trim()) return toast.error("Enter what the ticket is about.");
    if (form.closedDate && form.openedDate && form.closedDate < form.openedDate) {
      return toast.error("The close date can't be before the open date.");
    }

    const input: SupportTicketInput = {
      ticketRef: form.ticketRef.trim() || null,
      subject: form.subject.trim(),
      openedDate: form.openedDate || null,
      closedDate: form.closedDate || null,
    };

    startTransition(async () => {
      const res = editing
        ? await updateSupportTicket(siteId, target.id, input)
        : await createSupportTicket(siteId, input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Ticket updated." : "Ticket logged.");
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit support ticket" : "Log support ticket"}</DialogTitle>
          <DialogDescription>
            Record a support ticket raised for this site.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-ref">Ticket ID</Label>
            <Input
              id="st-ref"
              value={form.ticketRef}
              onChange={(e) => setForm((f) => ({ ...f, ticketRef: e.target.value }))}
              placeholder="e.g. #12345 (from your helpdesk)"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-subject">
              Ticket about <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="st-subject"
              rows={2}
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Short description of what the ticket is about"
              className="min-h-16 rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-opened">Open date</Label>
              <input
                id="st-opened"
                type="date"
                value={form.openedDate}
                onChange={(e) => setForm((f) => ({ ...f, openedDate: e.target.value }))}
                className={dateInputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-closed">Close date</Label>
              <input
                id="st-closed"
                type="date"
                value={form.closedDate}
                min={form.openedDate || undefined}
                onChange={(e) => setForm((f) => ({ ...f, closedDate: e.target.value }))}
                className={dateInputClass}
              />
              <p className="text-xs text-slate-400">Leave blank while the ticket is open.</p>
            </div>
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
            {pending
              ? editing
                ? "Saving…"
                : "Logging…"
              : editing
                ? "Save changes"
                : "Log ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
