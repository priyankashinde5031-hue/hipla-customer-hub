"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { updateInvoice } from "./invoice-actions";

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MANUAL_STATUSES = ["draft", "raised", "cancelled"];

export function EditInvoiceButton({
  invoiceId,
  invoiceNumber,
  currentStatus,
  issueDate: initialIssue,
  dueDate: initialDue,
  siteId,
}: {
  invoiceId: string;
  invoiceNumber: string;
  currentStatus: string;
  issueDate: string | null;
  dueDate: string | null;
  siteId: string;
}) {
  const [open, setOpen] = useState(false);
  // due / overdue / part-paid / cleared are derived; if the stored status is one
  // of those, default the picker to "raised".
  const [status, setStatus] = useState(
    MANUAL_STATUSES.includes(currentStatus) ? currentStatus : "raised",
  );
  const [issueDate, setIssueDate] = useState(initialIssue ?? "");
  const [dueDate, setDueDate] = useState(initialDue ?? "");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateInvoice(invoiceId, siteId, {
        status,
        issueDate: issueDate || null,
        dueDate: dueDate || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invoice updated.");
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        Edit
      </button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit invoice</DialogTitle>
              <DialogDescription>
                {invoiceNumber}. Paid, overdue and cleared statuses update on their own —
                set Draft, Raised or Cancelled here.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-status-edit">Status</Label>
                <select
                  id="inv-status-edit"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="raised">Raised</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-issue-edit">Issue date</Label>
                  <input
                    id="inv-issue-edit"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-due-edit">Due date</Label>
                  <input
                    id="inv-due-edit"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
