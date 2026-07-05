"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the commercial flow uses (admin/manager).
const canEditCommercials = canEditCatalogs;

const BUCKET = "renewal-attachments";

export type RenewalFieldInput = {
  expectedValueRupees: number | null; // editable projection baseline, in ₹
  renewalValueRupees: number | null; // actual, in ₹
  renewalReceivedDate: string | null; // yyyy-mm-dd
  paymentTermsId: string | null; // FK to the Settings payment_terms catalog
  renewalPoTypeId: string | null; // FK to the Settings renewal_po_types catalog
};

type ActionResult = { error?: string };

function rupeesToPaise(rupees: number | null): number | null {
  if (rupees === null) return null;
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

async function snapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  renewalId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from("renewals").select("*").eq("id", renewalId).maybeSingle();
  return (data as Record<string, unknown>) ?? null;
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: string,
  renewalId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: "renewal",
    entity_id: renewalId,
    before,
    after,
  });
}

// Save the editable fields on a single renewal year.
export async function updateRenewal(
  renewalId: string,
  siteId: string,
  input: RenewalFieldInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to edit renewals." };
  }

  const expectedPaise = rupeesToPaise(input.expectedValueRupees);
  if (input.expectedValueRupees !== null && expectedPaise === null) {
    return { error: "Expected value must be zero or more." };
  }
  const valuePaise = rupeesToPaise(input.renewalValueRupees);
  if (input.renewalValueRupees !== null && valuePaise === null) {
    return { error: "Renewal value must be zero or more." };
  }

  const supabase = await createClient();
  const before = await snapshot(supabase, renewalId);
  if (!before) return { error: "Renewal not found." };

  const patch = {
    expected_value_paise: expectedPaise,
    renewal_value_paise: valuePaise,
    renewal_received_date: input.renewalReceivedDate || null,
    payment_terms_id: input.paymentTermsId || null,
    renewal_po_type_id: input.renewalPoTypeId || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("renewals").update(patch).eq("id", renewalId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "update", renewalId, before, patch);
  revalidatePath(`/sites/${siteId}`);
  return {};
}

// Mark a renewal complete. Requires both a renewal value and a received date.
export async function markRenewalDone(
  renewalId: string,
  siteId: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to edit renewals." };
  }

  const supabase = await createClient();
  const before = await snapshot(supabase, renewalId);
  if (!before) return { error: "Renewal not found." };

  if (before.renewal_value_paise === null || before.renewal_value_paise === undefined) {
    return { error: "Add a renewal value before marking it done." };
  }
  if (!before.renewal_received_date) {
    return { error: "Add a renewal received date before marking it done." };
  }

  const { error } = await supabase
    .from("renewals")
    .update({ status: "renewed", updated_at: new Date().toISOString() })
    .eq("id", renewalId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "update", renewalId, before, { status: "renewed" });
  revalidatePath(`/sites/${siteId}`);
  return {};
}

// Upload a PO file for a specific renewal year. Bytes go to Supabase Storage;
// the path is recorded in `attachments` and linked on the renewal (CLAUDE.md:
// never base64 a file into the database).
export async function uploadRenewalAttachment(
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to upload renewal files." };
  }

  const renewalId = String(formData.get("renewalId") || "");
  const siteId = String(formData.get("siteId") || "");
  const file = formData.get("file");
  if (!renewalId || !siteId) return { error: "Missing renewal reference." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  const supabase = await createClient();
  const before = await snapshot(supabase, renewalId);
  if (!before) return { error: "Renewal not found." };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${renewalId}/${Date.now()}-${safeName}`;

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

  const { error: linkErr } = await supabase
    .from("renewals")
    .update({ attachment_id: attachment.id, updated_at: new Date().toISOString() })
    .eq("id", renewalId);
  if (linkErr) return { error: linkErr.message };

  await writeAudit(supabase, user!.id, "update", renewalId, before, {
    attachment_id: attachment.id,
    original_filename: file.name,
  });
  revalidatePath(`/sites/${siteId}`);
  return {};
}
