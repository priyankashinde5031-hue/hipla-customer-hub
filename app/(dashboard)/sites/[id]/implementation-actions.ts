"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { missingRequiredFields, type StageData } from "./implementation/stage-config";

// Same admin/manager rule the rest of the ops flow uses.
const canEditImplementation = canEditCatalogs;

type ActionResult = { error?: string };
type SaveResult = { error?: string; missing?: { key: string; label: string }[] };

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
    entity_type: "implementation_project",
    entity_id: entityId,
    before,
    after,
  });
}

// IMPL-XXXXXXXX-XXX from crypto-random base36. Uppercase, no ambiguity concerns
// since it's a handle, not a secret.
function generateProjectCode(): string {
  const rnd = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 36).toString(36),
    )
      .join("")
      .toUpperCase();
  return `IMPL-${rnd(8)}-${rnd(3)}`;
}

// Create a new implementation project for a site. The DB trigger seeds its 5
// stage rows; overall_status starts 'not_started'.
export async function createProject(
  siteId: string,
  projectName: string,
  poId?: string | null,
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentInternalUser();
  if (!canEditImplementation(user)) {
    return { error: "You don't have permission to create projects." };
  }
  const name = projectName?.trim();
  if (!name) return { error: "Enter a project name." };

  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("organization_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return { error: "Site not found." };

  // Retry on the (astronomically unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateProjectCode();
    const { data, error } = await supabase
      .from("implementation_projects")
      .insert({
        site_id: siteId,
        org_id: site.organization_id,
        project_code: code,
        project_name: name,
        po_id: poId || null,
      })
      .select("id")
      .single();

    if (!error && data) {
      await writeAudit(supabase, user!.id, "create", data.id, null, {
        project_code: code,
        project_name: name,
        site_id: siteId,
        po_id: poId || null,
      });
      revalidatePath(`/sites/${siteId}/implementation`);
      revalidatePath(`/sites/${siteId}`);
      return { id: data.id };
    }
    // 23505 = unique_violation; only retry that, else bail out.
    if (error && error.code !== "23505") return { error: error.message };
  }
  return { error: "Could not generate a unique project code — please retry." };
}

// Link (or clear) the PO a project delivers. That PO's renewal dates are then
// anchored to this project's go-live date (see sites/[id]/page.tsx).
export async function updateProjectPo(
  projectId: string,
  siteId: string,
  poId: string | null,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditImplementation(user)) {
    return { error: "You don't have permission to edit projects." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("implementation_projects")
    .update({ po_id: poId || null, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "update", projectId, null, { po_id: poId || null });
  revalidatePath(`/sites/${siteId}/implementation`);
  revalidatePath(`/sites/${siteId}`);
  return {};
}

export async function renameProject(
  projectId: string,
  siteId: string,
  name: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditImplementation(user)) {
    return { error: "You don't have permission to rename projects." };
  }
  const trimmed = name?.trim();
  if (!trimmed) return { error: "Enter a project name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("implementation_projects")
    .update({ project_name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "update", projectId, null, { project_name: trimmed });
  revalidatePath(`/sites/${siteId}/implementation`);
  revalidatePath(`/sites/${siteId}`);
  return {};
}

// Persist a stage's data. `markComplete` = the explicit "Save Stage" (validates
// required fields and may flip to `complete`); otherwise it's an autosave draft
// that only ever sets `in_progress`. We NEVER block the save — missing required
// fields come back as hints so the UI can show them inline.
async function persistStage(
  projectId: string,
  siteId: string,
  stageNumber: number,
  data: StageData,
  markComplete: boolean,
): Promise<SaveResult> {
  const user = await getCurrentInternalUser();
  if (!canEditImplementation(user)) {
    return { error: "You don't have permission to edit this project." };
  }

  const supabase = await createClient();

  const missing = missingRequiredFields(stageNumber, data);
  const stageStatus =
    markComplete && missing.length === 0 ? "complete" : "in_progress";

  const { error } = await supabase
    .from("implementation_project_stages")
    .update({
      data,
      stage_status: stageStatus,
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("project_id", projectId)
    .eq("stage_number", stageNumber);
  if (error) return { error: error.message };

  // Side effects on an explicit, valid save only (spec §5.3/§5.4).
  //   * Each PO's renewal dates are anchored to its linked project's go-live
  //     date (computed on read in sites/[id]/page.tsx) — so we DON'T need to
  //     stamp the site here for renewals to be right.
  //   * We still seed the SITE-level go_live_date the FIRST time any project
  //     goes live (for the site meta display / status), but never clobber an
  //     existing value — avoids the multi-project "last write wins" ambiguity.
  //   * Stage 5 completing sets the site live (spec §5.3).
  if (markComplete) {
    if (stageNumber === 4 && typeof data.goLiveDate === "string" && data.goLiveDate) {
      const { data: siteRow } = await supabase
        .from("sites")
        .select("go_live_date")
        .eq("id", siteId)
        .maybeSingle();
      if (siteRow && !siteRow.go_live_date) {
        await supabase
          .from("sites")
          .update({ go_live_date: data.goLiveDate })
          .eq("id", siteId);
      }
    }
    if (stageNumber === 5 && stageStatus === "complete") {
      await supabase.from("sites").update({ status: "live" }).eq("id", siteId);
    }
  }

  await writeAudit(supabase, user!.id, markComplete ? "update" : "autosave", projectId, null, {
    stage_number: stageNumber,
    stage_status: stageStatus,
  });

  revalidatePath(`/sites/${siteId}/implementation`);
  revalidatePath(`/sites/${siteId}`);
  return { missing };
}

// Explicit Save Stage: validate + possibly complete.
export async function saveStage(
  projectId: string,
  siteId: string,
  stageNumber: number,
  data: StageData,
): Promise<SaveResult> {
  return persistStage(projectId, siteId, stageNumber, data, true);
}

// Debounced blur autosave: draft only, never completes, never validates.
export async function autosaveStageDraft(
  projectId: string,
  siteId: string,
  stageNumber: number,
  data: StageData,
): Promise<ActionResult> {
  const res = await persistStage(projectId, siteId, stageNumber, data, false);
  return res.error ? { error: res.error } : {};
}

// Upload an implementation file → Storage + attachments row. Mirrors
// uploadPoAttachment in po-actions.ts. Returns the reference the stage jsonb
// stores (never the bytes). Caller then saves the stage with the reference set.
export async function uploadImplementationAttachment(
  formData: FormData,
): Promise<{ error?: string; attachmentId?: string; filename?: string; storagePath?: string }> {
  const user = await getCurrentInternalUser();
  if (!canEditImplementation(user)) {
    return { error: "You don't have permission to upload files." };
  }

  const projectId = String(formData.get("projectId") || "");
  const file = formData.get("file");
  if (!projectId) return { error: "Missing project reference." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  const supabase = await createClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${projectId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from("implementation-attachments")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadErr) return { error: uploadErr.message };

  const { data: attachment, error: attErr } = await supabase
    .from("attachments")
    .insert({
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type || null,
      uploaded_by: user!.id,
    })
    .select("id")
    .single();
  if (attErr || !attachment) {
    return { error: attErr?.message ?? "Could not record the file." };
  }

  return { attachmentId: attachment.id, filename: file.name, storagePath: path };
}
