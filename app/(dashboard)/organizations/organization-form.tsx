"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { createOrganization, type OrganizationFormInput } from "./organization-actions";

type Option = { id: string; name: string };

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function OrganizationFormDialog({
  open,
  onClose,
  ownerOptions,
}: {
  open: boolean;
  onClose: () => void;
  ownerOptions: Option[];
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState<OrganizationFormInput["status"]>("prospect");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const input: OrganizationFormInput = {
      legalName,
      brandName: brandName || null,
      industry: industry || null,
      primaryDomain: primaryDomain || null,
      ownerId: ownerId || null,
      status,
      notes: notes || null,
    };

    startTransition(async () => {
      const result = await createOrganization(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${brandName || legalName} created.`);
      onClose();
      router.push(`/organizations/${result.organizationId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add organization</DialogTitle>
          <DialogDescription>
            The customer&apos;s HQ. You&apos;ll add its sites (offices) next.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-legal-name">
              Legal name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="org-legal-name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Acme Retail Private Limited"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-brand-name">Brand name</Label>
            <Input
              id="org-brand-name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. Acme Corp"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-industry">Industry</Label>
              <Input
                id="org-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Retail"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-domain">Primary domain</Label>
              <Input
                id="org-domain"
                value={primaryDomain}
                onChange={(e) => setPrimaryDomain(e.target.value)}
                placeholder="e.g. acme.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-owner">Owner (account manager)</Label>
              <select
                id="org-owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-status">Status</Label>
              <select
                id="org-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as OrganizationFormInput["status"])}
                className={inputClass}
              >
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="churned">Churned</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-notes">Notes</Label>
            <textarea
              id="org-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={submit}
            disabled={isPending || !legalName.trim()}
          >
            {isPending ? "Creating…" : "Create organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddOrganizationButton({ ownerOptions }: { ownerOptions: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="h-9 gap-1.5 bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add organization
      </Button>
      {open && (
        <OrganizationFormDialog
          open={open}
          onClose={() => setOpen(false)}
          ownerOptions={ownerOptions}
        />
      )}
    </>
  );
}
