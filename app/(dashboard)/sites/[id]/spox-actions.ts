"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the ops flow uses (admin/manager).
const canEditSpox = canEditCatalogs;

type ActionResult = { error?: string; id?: string };

// The role is now Settings-managed reference data (spox_roles), referenced by
// id — same as internal_owner_team_id. No hardcoded enum lives here anymore.
export type SpoxInput = {
  name: string;
  roleId: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  internalOwnerTeamId: string;
  internalOwnerUserId: string | null;
  hasTakenTraining: boolean;
};

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: "spox",
    entity_id: entityId,
    before,
    after,
  });
}

// Turn a raw form input into a validated DB row (minus site_id/status). Returns
// an error string if anything required is missing.
function toRow(input: SpoxInput): { row: Record<string, unknown> } | { error: string } {
  const name = input.name?.trim();
  if (!name) return { error: "Enter the contact's name." };
  if (!input.roleId) return { error: "Choose a role." };
  if (!input.internalOwnerTeamId) return { error: "Choose an internal owner team." };

  return {
    row: {
      name,
      spox_role_id: input.roleId,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      designation: input.designation?.trim() || null,
      internal_owner_team_id: input.internalOwnerTeamId,
      internal_owner_user_id: input.internalOwnerUserId || null,
      has_taken_training: !!input.hasTakenTraining,
    },
  };
}

// Add a new active Spox for this site.
export async function createSpox(siteId: string, input: SpoxInput): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSpox(user)) {
    return { error: "You don't have permission to add contacts." };
  }

  const built = toRow(input);
  if ("error" in built) return { error: built.error };

  const supabase = await createClient();
  const row = { ...built.row, site_id: siteId, status: "active" as const };
  const { data, error } = await supabase.from("spox").insert(row).select("id").single();
  if (error || !data) return { error: error?.message ?? "Could not add the contact." };

  await writeAudit(supabase, user!.id, "create", data.id, null, row);
  revalidatePath(`/sites/${siteId}/spox`);
  revalidatePath(`/sites/${siteId}`);
  return { id: data.id };
}

// Edit a Spox's details only — never status / replacement chain (spec §6.1).
export async function updateSpox(
  spoxId: string,
  siteId: string,
  input: SpoxInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSpox(user)) {
    return { error: "You don't have permission to edit contacts." };
  }

  const built = toRow(input);
  if ("error" in built) return { error: built.error };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("spox")
    .select("*")
    .eq("id", spoxId)
    .maybeSingle();
  if (!before) return { error: "Contact not found." };

  const row = { ...built.row, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("spox").update(row).eq("id", spoxId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "update", spoxId, before as Record<string, unknown>, row);
  revalidatePath(`/sites/${siteId}/spox`);
  revalidatePath(`/sites/${siteId}`);
  return { id: spoxId };
}

// Mark a Spox as "left" and record who replaced them (spec §5). The replacement
// is mandatory: either an existing active Spox at this site, or a brand-new one
// created inline (which we insert first, then link atomically via the RPC).
export async function deactivateSpox(
  siteId: string,
  oldId: string,
  replacement: { replacementId?: string; newSpox?: SpoxInput },
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSpox(user)) {
    return { error: "You don't have permission to deactivate contacts." };
  }

  const supabase = await createClient();

  let replacementId = replacement.replacementId ?? "";

  // Create the replacement Spox first if the user chose "+ Add new Spox".
  if (!replacementId && replacement.newSpox) {
    const created = await createSpox(siteId, replacement.newSpox);
    if (created.error || !created.id) {
      return { error: created.error ?? "Could not create the replacement contact." };
    }
    replacementId = created.id;
  }

  if (!replacementId) {
    return { error: "Select or add a replacement before deactivating this contact." };
  }

  const { data: before } = await supabase
    .from("spox")
    .select("*")
    .eq("id", oldId)
    .maybeSingle();
  if (!before) return { error: "Contact not found." };

  const { error } = await supabase.rpc("deactivate_spox", {
    p_spox_id: oldId,
    p_replacement_id: replacementId,
  });
  if (error) {
    // Surface the RPC's named exceptions as plain language.
    const map: Record<string, string> = {
      REPLACEMENT_REQUIRED: "Select a replacement first.",
      REPLACEMENT_IS_SELF: "A contact can't replace themselves.",
      SPOX_NOT_FOUND: "Contact not found.",
      ALREADY_INACTIVE: "This contact is already inactive.",
      REPLACEMENT_NOT_FOUND: "The chosen replacement no longer exists.",
      REPLACEMENT_INACTIVE: "The chosen replacement is no longer active.",
      REPLACEMENT_CROSS_SITE: "The replacement must belong to the same site.",
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    return { error: key ? map[key] : error.message };
  }

  await writeAudit(supabase, user!.id, "update", oldId, before as Record<string, unknown>, {
    ...(before as Record<string, unknown>),
    status: "inactive",
    replaced_by_id: replacementId,
  });
  revalidatePath(`/sites/${siteId}/spox`);
  revalidatePath(`/sites/${siteId}`);
  return { id: replacementId };
}

// Hard-delete a Spox record — for genuine data-entry mistakes only (spec §6.3).
// The replaced_by_id self-FK is ON DELETE SET NULL, so any record pointing here
// has its reference nulled automatically instead of blocking the delete.
export async function deleteSpox(siteId: string, spoxId: string): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSpox(user)) {
    return { error: "You don't have permission to delete contacts." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("spox")
    .select("*")
    .eq("id", spoxId)
    .maybeSingle();
  if (!before) return { error: "Contact not found." };

  const { error } = await supabase.from("spox").delete().eq("id", spoxId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "delete", spoxId, before as Record<string, unknown>, null);
  revalidatePath(`/sites/${siteId}/spox`);
  revalidatePath(`/sites/${siteId}`);
  return { id: spoxId };
}
