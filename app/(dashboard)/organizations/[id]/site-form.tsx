"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  createSite,
  updateSite,
  type SiteFormInput,
  type AddressFieldsInput,
} from "./site-actions";

type Option = { id: string; name: string };

// Prefill values for edit mode. Mirrors the form's own fields (all as the
// string/boolean shapes the inputs use).
export type SiteInitial = {
  name: string;
  isHq: boolean;
  status: SiteFormInput["status"];
  region: string;
  timezone: string;
  gstNumber: string;
  goLiveDate: string;
  onboardingOwnerId: string;
  csOwnerId: string;
  addressSite: AddressFieldsInput;
  addressBilling: AddressFieldsInput;
  addressShipping: AddressFieldsInput;
};

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const blankAddress: AddressFieldsInput = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
};

function AddressFieldset({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AddressFieldsInput;
  onChange: (v: AddressFieldsInput) => void;
}) {
  function set(key: keyof AddressFieldsInput, v: string) {
    onChange({ ...value, [key]: v });
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </h4>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Address line 1"
          value={value.line1}
          onChange={(e) => set("line1", e.target.value)}
          className="sm:col-span-2"
        />
        <Input
          placeholder="Address line 2"
          value={value.line2}
          onChange={(e) => set("line2", e.target.value)}
          className="sm:col-span-2"
        />
        <Input
          placeholder="City"
          value={value.city}
          onChange={(e) => set("city", e.target.value)}
        />
        <Input
          placeholder="State"
          value={value.state}
          onChange={(e) => set("state", e.target.value)}
        />
        <Input
          placeholder="Pincode"
          value={value.pincode}
          onChange={(e) => set("pincode", e.target.value)}
        />
      </div>
    </div>
  );
}

export function SiteFormDialog({
  open,
  onClose,
  organizationId,
  suggestHq = false,
  ownerOptions,
  mode = "create",
  siteId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  suggestHq?: boolean;
  ownerOptions: Option[];
  mode?: "create" | "edit";
  siteId?: string;
  initial?: SiteInitial;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [name, setName] = useState(initial?.name ?? "");
  const [isHq, setIsHq] = useState(initial?.isHq ?? suggestHq);
  const [status, setStatus] = useState<SiteFormInput["status"]>(
    initial?.status ?? "prospect",
  );
  const [region, setRegion] = useState(initial?.region ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "");
  const [gstNumber, setGstNumber] = useState(initial?.gstNumber ?? "");
  const [goLiveDate, setGoLiveDate] = useState(initial?.goLiveDate ?? "");
  const [onboardingOwnerId, setOnboardingOwnerId] = useState(
    initial?.onboardingOwnerId ?? "",
  );
  const [csOwnerId, setCsOwnerId] = useState(initial?.csOwnerId ?? "");
  const [addressSite, setAddressSite] = useState(initial?.addressSite ?? blankAddress);
  const [addressBilling, setAddressBilling] = useState(
    initial?.addressBilling ?? blankAddress,
  );
  const [addressShipping, setAddressShipping] = useState(
    initial?.addressShipping ?? blankAddress,
  );
  const [isPending, startTransition] = useTransition();

  function submit() {
    const input: SiteFormInput = {
      name,
      isHq,
      status,
      region: region || null,
      timezone: timezone || null,
      gstNumber: gstNumber || null,
      goLiveDate: goLiveDate || null,
      onboardingOwnerId: onboardingOwnerId || null,
      csOwnerId: csOwnerId || null,
      addressSite,
      addressBilling,
      addressShipping,
    };

    startTransition(async () => {
      const result =
        isEdit && siteId
          ? await updateSite(siteId, input)
          : await createSite(organizationId, input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? `${name} saved.` : `${name} created.`);
      onClose();
      if (isEdit) {
        router.refresh();
      } else {
        router.push(`/sites/${result.siteId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit site" : "Add site"}</DialogTitle>
          <DialogDescription>
            One office of this organization. Almost everything operational hangs off the site.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-name">
              Site name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="site-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme HQ — Mumbai"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Mark as HQ</p>
              <p className="text-xs text-slate-500">
                The primary office for this organization.
              </p>
            </div>
            <Switch checked={isHq} onCheckedChange={setIsHq} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-status">Status</Label>
              <select
                id="site-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as SiteFormInput["status"])}
                className={inputClass}
              >
                <option value="prospect">Prospect</option>
                <option value="implementing">Implementing</option>
                <option value="live">Live</option>
                <option value="suspended">Suspended</option>
                <option value="churned">Churned</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-region">Region</Label>
              <Input
                id="site-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. West India"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-timezone">Timezone</Label>
              <Input
                id="site-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Asia/Kolkata"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-gst">GST number</Label>
              <Input
                id="site-gst"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-go-live">Go-live date</Label>
              <Input
                id="site-go-live"
                type="date"
                value={goLiveDate}
                onChange={(e) => setGoLiveDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-onboarding-owner">Onboarding owner</Label>
              <select
                id="site-onboarding-owner"
                value={onboardingOwnerId}
                onChange={(e) => setOnboardingOwnerId(e.target.value)}
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
              <Label htmlFor="site-cs-owner">CS owner</Label>
              <select
                id="site-cs-owner"
                value={csOwnerId}
                onChange={(e) => setCsOwnerId(e.target.value)}
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
          </div>

          <AddressFieldset label="Site / physical" value={addressSite} onChange={setAddressSite} />
          <AddressFieldset label="Billing" value={addressBilling} onChange={setAddressBilling} />
          <AddressFieldset label="Shipping" value={addressShipping} onChange={setAddressShipping} />
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={submit}
            disabled={isPending || !name.trim()}
          >
            {isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddSiteButton({
  organizationId,
  suggestHq,
  ownerOptions,
}: {
  organizationId: string;
  suggestHq: boolean;
  ownerOptions: Option[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="h-9 gap-1.5 bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add site
      </Button>
      {open && (
        <SiteFormDialog
          open={open}
          onClose={() => setOpen(false)}
          organizationId={organizationId}
          suggestHq={suggestHq}
          ownerOptions={ownerOptions}
        />
      )}
    </>
  );
}
