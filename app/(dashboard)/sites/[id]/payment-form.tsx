"use client";

import { useState, useTransition } from "react";
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
import { recordPayment } from "./invoice-actions";

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const PAYMENT_MODES = ["Bank transfer", "UPI", "Cheque", "Cash", "Card", "Other"];

const todayISO = () => new Date().toISOString().slice(0, 10);

export function RecordPaymentButton({
  invoiceId,
  invoiceNumber,
  balancePaise,
  siteId,
}: {
  invoiceId: string;
  invoiceNumber: string;
  balancePaise: number;
  siteId: string;
}) {
  const [open, setOpen] = useState(false);
  // Default the amount to the outstanding balance (the common case: paying it off).
  const [amount, setAmount] = useState(balancePaise > 0 ? (balancePaise / 100).toFixed(2) : "");
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [mode, setMode] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await recordPayment(invoiceId, siteId, {
        amountRupees: amount.trim() === "" ? 0 : Number(amount),
        receivedDate,
        mode: mode || null,
        reference: reference || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment recorded.");
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
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        Record payment
      </button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Record payment</DialogTitle>
              <DialogDescription>
                Against {invoiceNumber}. The invoice status updates automatically once the
                payments cover the total.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-amount">
                    Amount (₹) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-date">
                    Received date <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="pay-date"
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-mode">Mode</Label>
                  <select
                    id="pay-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className={inputClass}
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-ref">Reference</Label>
                  <Input
                    id="pay-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="UTR / cheque no."
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
                {isPending ? "Saving…" : "Record payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
