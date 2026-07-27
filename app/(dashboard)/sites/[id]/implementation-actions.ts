"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { missingRequiredFields, type StageData, type FileValue } from "./implementation/stage-config";

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

  // A recorded go-live must anchor to a PO (owner-confirmed): the PO's renewal
  // dates hang off this date, so Stage 4 cannot be COMPLETED until the project
  // has a linked PO. Modelled as a missing requirement (not a hard error) so the
  // typed date still saves as a draft rather than being lost.
  let poMissing = false;
  if (
    stageNumber === 4 &&
    typeof data.goLiveDate === "string" &&
    data.goLiveDate.trim()
  ) {
    const { data: proj } = await supabase
      .from("implementation_projects")
      .select("po_id")
      .eq("id", projectId)
      .maybeSingle();
    poMissing = !proj?.po_id;
  }
  const missingOut = poMissing
    ? [...missing, { key: "linkedPo", label: "Linked PO (its renewals anchor to this go-live date)" }]
    : missing;

  const stageStatus =
    markComplete && missing.length === 0 && !poMissing ? "complete" : "in_progress";

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
  //     date (computed on read in sites/[id]/page.tsx). Go-live lives ONLY on the
  //     project now — we no longer stamp any site-level go-live date.
  //   * Stage 5 completing sets the site live (spec §5.3).
  if (markComplete) {
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
  return { missing: missingOut };
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

// Store one file → Storage + attachments row, returning the reference the stage
// jsonb keeps (never the bytes). Shared by the interactive uploader and the
// backfill action so both write files the same way.
async function storeAttachment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectId: string,
  file: File,
): Promise<{ error?: string; value?: FileValue }> {
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
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (attErr || !attachment) {
    return { error: attErr?.message ?? "Could not record the file." };
  }

  return { value: { attachmentId: attachment.id, filename: file.name, storagePath: path } };
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
  const res = await storeAttachment(supabase, user!.id, projectId, file);
  if (res.error || !res.value) return { error: res.error ?? "Upload failed." };

  return {
    attachmentId: res.value.attachmentId,
    filename: res.value.filename,
    storagePath: res.value.storagePath,
  };
}

// "Record a past go-live": create an implementation project that is ALREADY
// finished, for the years of back-dated orders we don't want to re-walk through
// the 5-stage stepper. Writes the same fields the stepper would — go-live date +
// proof (Stage 4), commercial document (Stage 1's final quotation) — then marks
// all five stages complete (the trigger flips overall_status to 'completed') and
// sets the site live. New orders still go through the full stepper.
export async function backfillCompletedProject(
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentInternalUser();
  if (!canEditImplementation(user)) {
    return { error: "You don't have permission to record a go-live." };
  }

  const siteId = String(formData.get("siteId") || "");
  const projectName = String(formData.get("projectName") || "").trim() || "Historical go-live";
  const poId = String(formData.get("poId") || "") || null;
  const goLiveDate = String(formData.get("goLiveDate") || "").trim();
  const proofFile = formData.get("goLiveProof");
  const commercialFile = formData.get("commercial");

  if (!siteId) return { error: "Missing site reference." };
  if (!goLiveDate) return { error: "Enter the go-live date." };
  // A go-live must anchor to a PO — its renewals are computed from this date.
  if (!poId) {
    return { error: "Select the PO this go-live belongs to — its renewals anchor to this date." };
  }

  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("organization_id")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return { error: "Site not found." };

  // Create the project row (its 5 stage rows are seeded by the DB trigger).
  let projectId: string | null = null;
  let projectCode = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateProjectCode();
    const { data, error } = await supabase
      .from("implementation_projects")
      .insert({
        site_id: siteId,
        org_id: site.organization_id,
        project_code: code,
        project_name: projectName,
        po_id: poId,
      })
      .select("id")
      .single();
    if (!error && data) {
      projectId = data.id;
      projectCode = code;
      break;
    }
    if (error && error.code !== "23505") return { error: error.message };
  }
  if (!projectId) {
    return { error: "Could not generate a unique project code — please retry." };
  }

  // Store the two optional files under the new project.
  let proof: FileValue = null;
  let commercial: FileValue = null;
  if (proofFile instanceof File && proofFile.size > 0) {
    const res = await storeAttachment(supabase, user!.id, projectId, proofFile);
    if (res.error) return { error: res.error };
    proof = res.value ?? null;
  }
  if (commercialFile instanceof File && commercialFile.size > 0) {
    const res = await storeAttachment(supabase, user!.id, projectId, commercialFile);
    if (res.error) return { error: res.error };
    commercial = res.value ?? null;
  }

  // Write the known data into the stages it belongs to, then mark ALL five
  // complete so the computed overall_status becomes 'completed'.
  const stageData: Record<number, StageData> = {
    1: commercial ? { finalQuotation: commercial } : {},
    2: {},
    3: {},
    4: { goLiveDate, ...(proof ? { goLiveEmailProof: proof } : {}) },
    5: {},
  };
  for (let n = 1; n <= 5; n++) {
    const { error } = await supabase
      .from("implementation_project_stages")
      .update({
        data: stageData[n],
        stage_status: "complete",
        updated_at: new Date().toISOString(),
        updated_by: user!.id,
      })
      .eq("project_id", projectId)
      .eq("stage_number", n);
    if (error) return { error: error.message };
  }

  // Mirror the stepper's live-site side effect: set the site live. Go-live lives
  // on the project (Stage 4) only — no site-level go-live date is stamped.
  await supabase.from("sites").update({ status: "live" }).eq("id", siteId);

  await writeAudit(supabase, user!.id, "backfill", projectId, null, {
    project_code: projectCode,
    project_name: projectName,
    site_id: siteId,
    po_id: poId,
    go_live_date: goLiveDate,
    has_proof: !!proof,
    has_commercial: !!commercial,
  });

  revalidatePath(`/sites/${siteId}/implementation`);
  revalidatePath(`/sites/${siteId}`);
  return { id: projectId };
}
