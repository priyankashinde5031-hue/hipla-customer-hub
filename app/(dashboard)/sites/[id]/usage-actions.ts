"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the ops flow uses (admin/manager).
const canEditUsage = canEditCatalogs;

type ActionResult = { error?: string };

export type UsageEntryInput = {
  moduleId: string;
  entrySourceId: string;
  year: number;
  month: number; // 1–12
  week: number; // 1–5
  entryCount: number;
  notes: string | null;
};

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

// Add a manual weekly usage count for this site.
export async function addUsageEntry(
  siteId: string,
  input: UsageEntryInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditUsage(user)) {
    return { error: "You don't have permission to add usage entries." };
  }

  if (!input.moduleId) return { error: "Choose a module." };
  if (!input.entrySourceId) return { error: "Choose an entry source." };
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    return { error: "Month must be between 1 and 12." };
  }
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 5) {
    return { error: "Week must be between 1 and 5." };
  }
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    return { error: "Enter a valid year." };
  }
  if (!Number.isFinite(input.entryCount) || input.entryCount < 0) {
    return { error: "Number of entries must be zero or more." };
  }

  const supabase = await createClient();
  const row = {
    site_id: siteId,
    module_id: input.moduleId,
    entry_source_id: input.entrySourceId,
    year: input.year,
    month: input.month,
    week: input.week,
    entry_count: Math.round(input.entryCount),
    notes: input.notes?.trim() || null,
    source: "manual" as const,
    created_by: user!.id,
  };

  const { data, error } = await supabase
    .from("usage_entries")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add the entry." };

  await writeAudit(supabase, user!.id, "create", "usage_entry", data.id, null, row);
  revalidatePath(`/sites/${siteId}/usage`);
  return {};
}

// Delete a weekly usage count (still audited, for history).
export async function deleteUsageEntry(
  entryId: string,
  siteId: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditUsage(user)) {
    return { error: "You don't have permission to delete usage entries." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("usage_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (!before) return { error: "Usage entry not found." };

  const { error } = await supabase.from("usage_entries").delete().eq("id", entryId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "delete",
    "usage_entry",
    entryId,
    before as Record<string, unknown>,
    null,
  );
  revalidatePath(`/sites/${siteId}/usage`);
  return {};
}

// Set (upsert) the expected entries-per-week target for a Site + Module.
export async function setUsageExpectation(
  siteId: string,
  moduleId: string,
  expectedPerWeek: number,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditUsage(user)) {
    return { error: "You don't have permission to set usage targets." };
  }
  if (!moduleId) return { error: "Missing module." };
  if (!Number.isFinite(expectedPerWeek) || expectedPerWeek < 0) {
    return { error: "Expected entries must be zero or more." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("usage_expectations")
    .select("*")
    .eq("site_id", siteId)
    .eq("module_id", moduleId)
    .maybeSingle();

  const row = {
    site_id: siteId,
    module_id: moduleId,
    expected_per_week: Math.round(expectedPerWeek),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("usage_expectations")
    .upsert(row, { onConflict: "site_id,module_id" });
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "update",
    "usage_expectation",
    moduleId,
    (before as Record<string, unknown>) ?? null,
    row,
  );
  revalidatePath(`/sites/${siteId}/usage`);
  return {};
}
