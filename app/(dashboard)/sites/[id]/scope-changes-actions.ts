"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the ops flow uses (admin/manager).
const canEditScope = canEditCatalogs;

type ActionResult = { error?: string; id?: string };

// Local (a "use server" module may only export async functions). Mirrored as
// STATUS_META in the client view for labels/badges.
const SCOPE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ScopeChangeStatus = (typeof SCOPE_STATUSES)[number];

export type ScopeChangeInput = {
  description: string;
  changeDate: string | null; // YYYY-MM-DD; null → DB default (today)
  impact: string | null;
  approverId: string;
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
    entity_type: "scope_change",
    entity_id: entityId,
    before,
    after,
  });
}

// Record a new scope change request (defaults to 'pending'). The approver is
// stored but not yet emailed — no notification provider is wired (see migration).
export async function createScopeChange(
  siteId: string,
  input: ScopeChangeInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditScope(user)) {
    return { error: "You don't have permission to add scope changes." };
  }

  const description = input.description?.trim();
  if (!description) return { error: "Describe the scope change." };
  if (!input.approverId) return { error: "Select an approver." };

  const supabase = await createClient();
  const row: Record<string, unknown> = {
    site_id: siteId,
    description,
    impact: input.impact?.trim() || null,
    approver_id: input.approverId,
    created_by: user!.id,
    status: "pending",
  };
  // Only set change_date when provided, so the DB default (today) applies otherwise.
  if (input.changeDate) row.change_date = input.changeDate;

  const { data, error } = await supabase
    .from("scope_changes")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not record the scope change." };
  }

  await writeAudit(supabase, user!.id, "create", data.id, null, row);
  revalidatePath(`/sites/${siteId}`);
  return { id: data.id };
}

// Approve / reject a pending scope change (spec §5.7 status transition).
export async function setScopeChangeStatus(
  siteId: string,
  scopeChangeId: string,
  status: ScopeChangeStatus,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditScope(user)) {
    return { error: "You don't have permission to update scope changes." };
  }
  if (!SCOPE_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("scope_changes")
    .select("*")
    .eq("id", scopeChangeId)
    .maybeSingle();
  if (!before) return { error: "Scope change not found." };

  const patch = { status, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from("scope_changes")
    .update(patch)
    .eq("id", scopeChangeId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "update",
    scopeChangeId,
    before as Record<string, unknown>,
    { ...(before as Record<string, unknown>), ...patch },
  );
  revalidatePath(`/sites/${siteId}`);
  return { id: scopeChangeId };
}

// Soft-delete: hide from the timeline/summary but keep the row (CLAUDE.md).
export async function deleteScopeChange(
  siteId: string,
  scopeChangeId: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditScope(user)) {
    return { error: "You don't have permission to delete scope changes." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("scope_changes")
    .select("*")
    .eq("id", scopeChangeId)
    .maybeSingle();
  if (!before) return { error: "Scope change not found." };

  const patch = {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("scope_changes")
    .update(patch)
    .eq("id", scopeChangeId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "delete",
    scopeChangeId,
    before as Record<string, unknown>,
    { ...(before as Record<string, unknown>), ...patch },
  );
  revalidatePath(`/sites/${siteId}`);
  return { id: scopeChangeId };
}
