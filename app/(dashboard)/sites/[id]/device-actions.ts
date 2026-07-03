"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the ops flow uses (admin/manager).
const canEditHardware = canEditCatalogs;

// field lets the client surface the message inline on a specific input
// (spec §5: Esper duplicates are a field-level error, not a generic toast).
type ActionResult = { error?: string; field?: "esperId" };

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before,
    after,
  });
}

// Is this Esper ID already in use by an ACTIVE device at any site? "Active" =
// not soft-deleted and not already replaced (spec rule 5 — historical/replaced
// units keep their old Esper ID for audit, so we don't clash with those).
// excludeDeviceId lets an in-place check ignore a specific row if ever needed.
async function esperIdTakenByActive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  esperId: string,
): Promise<boolean> {
  const { data: matches } = await supabase
    .from("devices")
    .select("id")
    .eq("is_deleted", false)
    .ilike("esper_id", esperId);
  if (!matches || matches.length === 0) return false;

  // Drop any match that has already been replaced (it's historical).
  const { data: replaced } = await supabase
    .from("device_replacements")
    .select("old_device_id")
    .in(
      "old_device_id",
      matches.map((m) => m.id),
    );
  const replacedIds = new Set((replaced ?? []).map((r) => r.old_device_id));
  return matches.some((m) => !replacedIds.has(m.id));
}

export type AddDeviceInput = {
  hardwareCatalogId: string;
  esperId: string;
  nameOnEsper: string;
};

// Add a brand-new device (first install) — no replacement history.
export async function addDevice(
  siteId: string,
  input: AddDeviceInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditHardware(user)) {
    return { error: "You don't have permission to add hardware." };
  }

  const esperId = input.esperId.trim();
  const nameOnEsper = input.nameOnEsper.trim();
  if (!input.hardwareCatalogId) return { error: "Choose a hardware name." };
  if (!esperId) return { error: "Enter the Esper ID.", field: "esperId" };
  if (!nameOnEsper) return { error: "Enter the name on Esper." };

  const supabase = await createClient();

  if (await esperIdTakenByActive(supabase, esperId)) {
    return { error: "An active device already uses this Esper ID.", field: "esperId" };
  }

  const row = {
    site_id: siteId,
    hardware_catalog_id: input.hardwareCatalogId,
    esper_id: esperId,
    name_on_esper: nameOnEsper,
  };
  const { data, error } = await supabase
    .from("devices")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add the device." };

  await writeAudit(supabase, user!.id, "create", "device", data.id, null, row);
  revalidatePath(`/sites/${siteId}/hardware`);
  return {};
}

// Soft-delete a device (spec rule 6). Only allowed when the device has NEVER
// been part of a replacement chain — otherwise it carries history we keep.
export async function deleteDevice(
  deviceId: string,
  siteId: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditHardware(user)) {
    return { error: "You don't have permission to delete hardware." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("devices")
    .select("*")
    .eq("id", deviceId)
    .maybeSingle();
  if (!before) return { error: "Device not found." };
  if (before.is_deleted) return { error: "Device is already deleted." };

  const { data: chain } = await supabase
    .from("device_replacements")
    .select("id")
    .or(`old_device_id.eq.${deviceId},new_device_id.eq.${deviceId}`)
    .limit(1);
  if (chain && chain.length > 0) {
    return {
      error: "This device has replacement history and can't be deleted.",
    };
  }

  const { error } = await supabase
    .from("devices")
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", deviceId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "soft_delete",
    "device",
    deviceId,
    before as Record<string, unknown>,
    { ...(before as Record<string, unknown>), is_deleted: true },
  );
  revalidatePath(`/sites/${siteId}/hardware`);
  return {};
}

export type ReplaceDeviceInput = {
  oldDeviceId: string;
  hardwareCatalogId: string;
  esperId: string;
  nameOnEsper: string;
  approvedBy: string;
  notes: string | null;
};

// Turn a raised-exception code from the replace_device() RPC into a friendly,
// sometimes field-scoped message (spec §5 error states).
function mapReplaceError(message: string): ActionResult {
  if (message.includes("ALREADY_REPLACED") || message.includes("uq_old_device")) {
    return { error: "This device was already replaced — refresh and try again." };
  }
  if (message.includes("ESPER_DUPLICATE")) {
    return { error: "An active device already uses this Esper ID.", field: "esperId" };
  }
  if (message.includes("OLD_DEVICE_NOT_FOUND")) {
    return { error: "The device to replace no longer exists — refresh and try again." };
  }
  if (message.includes("OLD_DEVICE_DELETED")) {
    return { error: "The device to replace was deleted — refresh and try again." };
  }
  if (message.includes("CROSS_SITE")) {
    return { error: "That device belongs to a different site." };
  }
  return { error: message || "Could not replace the device." };
}

// Replace an active device with a new one — atomic via the replace_device RPC
// (spec rule 3). Retires the old device and creates + links the new one, or
// does nothing at all if anything fails.
export async function replaceDevice(
  siteId: string,
  input: ReplaceDeviceInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditHardware(user)) {
    return { error: "You don't have permission to replace hardware." };
  }

  if (!input.oldDeviceId) return { error: "Choose the device to replace." };
  if (!input.hardwareCatalogId) return { error: "Choose a hardware name." };
  const esperId = input.esperId.trim();
  const nameOnEsper = input.nameOnEsper.trim();
  if (!esperId) return { error: "Enter the Esper ID.", field: "esperId" };
  if (!nameOnEsper) return { error: "Enter the name on Esper." };
  if (!input.approvedBy) return { error: "Choose an approver." };

  const supabase = await createClient();
  const { data: newDeviceId, error } = await supabase.rpc("replace_device", {
    p_site_id: siteId,
    p_old_device_id: input.oldDeviceId,
    p_hardware_catalog_id: input.hardwareCatalogId,
    p_esper_id: esperId,
    p_name_on_esper: nameOnEsper,
    p_approved_by: input.approvedBy,
    p_notes: input.notes?.trim() || null,
  });
  if (error) return mapReplaceError(error.message);

  await writeAudit(supabase, user!.id, "replace", "device", String(newDeviceId), null, {
    site_id: siteId,
    old_device_id: input.oldDeviceId,
    new_device_id: newDeviceId,
    approved_by: input.approvedBy,
  });
  revalidatePath(`/sites/${siteId}/hardware`);
  return {};
}
