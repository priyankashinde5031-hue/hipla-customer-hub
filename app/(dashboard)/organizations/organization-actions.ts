"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// canEditCatalogs already encodes "admin or manager" — reuse it rather than
// inventing a parallel check (same pattern as po-actions.ts).
const canEditOrganizations = canEditCatalogs;

export type OrganizationFormInput = {
  legalName: string;
  brandName: string | null;
  industry: string | null;
  primaryDomain: string | null;
  ownerId: string | null;
  status: "prospect" | "active" | "churned";
  notes: string | null;
};

type ActionResult = { error?: string; organizationId?: string };

export async function createOrganization(
  input: OrganizationFormInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditOrganizations(user)) {
    return { error: "You don't have permission to create organizations." };
  }

  const legalName = input.legalName?.trim();
  if (!legalName) return { error: "Legal name is required." };

  const supabase = await createClient();

  const row = {
    legal_name: legalName,
    brand_name: input.brandName?.trim() || null,
    industry: input.industry?.trim() || null,
    primary_domain: input.primaryDomain?.trim() || null,
    owner_id: input.ownerId || null,
    status: input.status,
    notes: input.notes?.trim() || null,
  };

  const { data: inserted, error } = await supabase
    .from("organizations")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the organization." };
  }

  await supabase.from("audit_log").insert({
    actor_id: user!.id,
    action: "create",
    entity_type: "organization",
    entity_id: inserted.id,
    before: null,
    after: row,
  });

  revalidatePath("/organizations");
  return { organizationId: inserted.id as string };
}
