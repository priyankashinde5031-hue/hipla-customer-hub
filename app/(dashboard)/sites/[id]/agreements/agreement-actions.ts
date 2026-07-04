"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the ops flow uses (admin/manager).
const canEditAgreements = canEditCatalogs;

const BUCKET = "agreement-attachments";

// Server-side backstop for the upload size. Mirrors the client cap (4 MB) and
// stays under Next's configured body limit (next.config: 5 MB) and Vercel's
// ~4.5 MB platform request cap. The client checks this too; this guards direct
// callers and gives a friendly message instead of a raw body-limit crash.
const MAX_FILE_MB = 4;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

type ActionResult = { error?: string; id?: string };

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
    entity_type: "agreement",
    entity_id: entityId,
    before,
    after,
  });
}

// Create an agreement. The form posts a FormData because it carries the file:
//   siteId, signedDate, agreementTypeId, signedById, file
// The file (if any) goes to Storage first, its metadata is recorded in
// `attachments`, and the agreement row links it (CLAUDE.md: never base64 a file
// into the DB; attachments always get a metadata row).
export async function createAgreement(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditAgreements(user)) {
    return { error: "You don't have permission to add agreements." };
  }

  const siteId = String(formData.get("siteId") || "");
  const signedDate = String(formData.get("signedDate") || "");
  const agreementTypeId = String(formData.get("agreementTypeId") || "");
  const signedById = String(formData.get("signedById") || "");
  const file = formData.get("file");

  if (!siteId) return { error: "Missing site reference." };
  if (!signedDate) return { error: "Pick the date the agreement was signed." };
  if (!agreementTypeId) return { error: "Choose an agreement type." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Attach the agreement file." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: `That file is too large (max ${MAX_FILE_MB} MB). Please upload a smaller file.` };
  }

  const supabase = await createClient();

  // 1) Upload the file, then record its metadata row.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${siteId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
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

  // 2) Insert the agreement row.
  const row: Record<string, unknown> = {
    site_id: siteId,
    signed_date: signedDate,
    agreement_type_id: agreementTypeId,
    attachment_id: attachment.id,
    signed_by_id: signedById || null,
    created_by: user!.id,
  };

  const { data, error } = await supabase
    .from("agreements")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not save the agreement." };
  }

  await writeAudit(supabase, user!.id, "create", data.id, null, row);
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/agreements`);
  return { id: data.id };
}

// Soft-delete: hide from the list but keep the row (CLAUDE.md).
export async function deleteAgreement(
  siteId: string,
  agreementId: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditAgreements(user)) {
    return { error: "You don't have permission to delete agreements." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle();
  if (!before) return { error: "Agreement not found." };

  const patch = {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("agreements")
    .update(patch)
    .eq("id", agreementId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "delete",
    agreementId,
    before as Record<string, unknown>,
    { ...(before as Record<string, unknown>), ...patch },
  );
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/agreements`);
  return { id: agreementId };
}
