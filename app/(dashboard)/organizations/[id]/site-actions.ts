"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

const canEditSites = canEditCatalogs;

export type AddressFieldsInput = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export type SiteFormInput = {
  name: string;
  isHq: boolean;
  status: "prospect" | "implementing" | "live" | "suspended" | "churned";
  region: string | null;
  timezone: string | null;
  gstNumber: string | null;
  goLiveDate: string | null; // yyyy-mm-dd
  onboardingOwnerId: string | null;
  csOwnerId: string | null;
  addressSite: AddressFieldsInput;
  addressBilling: AddressFieldsInput;
  addressShipping: AddressFieldsInput;
};

type ActionResult = { error?: string; siteId?: string };

// Empty jsonb over an object with only blank strings — nothing worth storing.
function addressToJson(a: AddressFieldsInput): Record<string, string> | null {
  const entries = Object.entries(a).filter(([, v]) => v.trim() !== "");
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, v.trim()]));
}

export async function createSite(
  organizationId: string,
  input: SiteFormInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSites(user)) {
    return { error: "You don't have permission to create sites." };
  }

  const name = input.name?.trim();
  if (!name) return { error: "Site name is required." };

  const supabase = await createClient();

  const row = {
    organization_id: organizationId,
    name,
    is_hq: input.isHq,
    status: input.status,
    region: input.region?.trim() || null,
    timezone: input.timezone?.trim() || null,
    gst_number: input.gstNumber?.trim() || null,
    go_live_date: input.goLiveDate || null,
    onboarding_owner_id: input.onboardingOwnerId || null,
    cs_owner_id: input.csOwnerId || null,
    address_site: addressToJson(input.addressSite),
    address_billing: addressToJson(input.addressBilling),
    address_shipping: addressToJson(input.addressShipping),
  };

  const { data: inserted, error } = await supabase
    .from("sites")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the site." };
  }

  await supabase.from("audit_log").insert({
    actor_id: user!.id,
    action: "create",
    entity_type: "site",
    entity_id: inserted.id,
    before: null,
    after: row,
  });

  revalidatePath(`/organizations/${organizationId}`);
  return { siteId: inserted.id as string };
}
