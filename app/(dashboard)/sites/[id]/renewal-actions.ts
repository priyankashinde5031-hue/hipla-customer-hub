"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { buildSchedule, type PaymentTermSpec } from "@/lib/invoicing";
import { regenerateScheduleForRenewalCycle } from "@/lib/revenue-schedule";

// Same permission rule the rest of the commercial flow uses (admin/manager).
const canEditCommercials = canEditCatalogs;

const BUCKET = "renewal-attachments";

export type RenewalFieldInput = {
  expectedValueRupees: number | null; // editable projection baseline, in ₹
  renewalValueRupees: number | null; // actual, in ₹
  renewalReceivedDate: string | null; // yyyy-mm-dd
  renewalDateOverride: string | null; // yyyy-mm-dd; null = follow the go-live-driven date
  paymentTermsId: string | null; // FK to the Settings payment_terms catalog
  renewalPoTypeId: string | null; // FK to the Settings renewal_po_types catalog
};

type ActionResult = { error?: string };

// GST for one renewal invoice row, from the origin PO's GST % (entered, not
// derived per line) — mirrors the PO invoice generator (invoice-form.tsx).
function gstPaiseFor(amountPaise: number, gstPercent: number | null): number {
  const pct = gstPercent ?? 0;
  return pct > 0 ? Math.round((amountPaise * pct) / 100) : 0;
}

type RenewalInvoiceRow = {
  po_id: string;
  contract_id: string | null;
  billed_site_id: string;
  renewal_id: string;
  amount_paise: number;
  gst_amount_paise: number;
  issue_date: string | null;
  due_date: string | null;
  status: string;
};

// Build (but don't insert) the invoice rows for a renewal year, splitting its
// renewal value by the payment term chosen on the renewal card — the SAME
// buildSchedule logic the PO's "Generate invoices" uses. Returns [] when there's
// nothing to generate (no term, no value, or the term yields no schedule).
//
// `anchorDate` = the renewal DATE (contract-year start), NOT the received date:
// periodic invoice periods and due dates are spaced from when the term begins,
// so a renewal marked done months late still bills the correct months. It's the
// already-resolved date the card shows (override, else go-live + offset), passed
// in so generation matches the previewed schedule exactly.
async function buildRenewalInvoicePayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  renewal: Record<string, unknown>,
  anchorDate: string | null,
): Promise<RenewalInvoiceRow[]> {
  const paymentTermsId = renewal.payment_terms_id as string | null;
  const totalPaise = renewal.renewal_value_paise as number | null;
  const poId = renewal.po_id as string | null;
  const billedSiteId = renewal.anchor_site_id as string | null;
  if (!paymentTermsId || !totalPaise || totalPaise <= 0 || !poId || !billedSiteId) {
    return [];
  }

  // Payment term → schedule spec (mirrors page.tsx's PO term mapping).
  const { data: term } = await supabase
    .from("payment_terms")
    .select(
      "schedule_type, invoices_per_year, timing, billing_schedule_days, installments:payment_term_installments ( label, percent, sort_order )",
    )
    .eq("id", paymentTermsId)
    .maybeSingle();
  if (!term) return [];

  const spec: PaymentTermSpec = {
    scheduleType: term.schedule_type === "milestone" ? "milestone" : "periodic",
    invoicesPerYear: term.invoices_per_year ?? null,
    timing: term.timing === "arrears" ? "arrears" : "advance",
    billingScheduleDays: term.billing_schedule_days ?? null,
    installments: ((term.installments ?? []) as { label: string; percent: number | string; sort_order: number }[])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ label: i.label, percent: Number(i.percent) })),
  };

  // Origin PO for GST % and the contract linkage the invoice must trace to.
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("gst_percent, contract_id")
    .eq("id", poId)
    .maybeSingle();
  const gstPercent = (po?.gst_percent as number | null) ?? null;

  const generated = buildSchedule({
    totalPaise,
    term: spec,
    contractMonths: (renewal.term_months as number | null) ?? 12,
    // Periodic invoices space from the RENEWAL DATE (contract-year start);
    // milestone dates stay blank for the user to fill (same as the PO flow).
    startDate: spec.scheduleType === "periodic" ? anchorDate : null,
  });
  if (generated.length === 0) return [];

  return generated.map((g) => ({
    po_id: poId,
    contract_id: (po?.contract_id as string | null) ?? null,
    billed_site_id: billedSiteId,
    renewal_id: renewal.id as string,
    amount_paise: g.amountPaise,
    gst_amount_paise: gstPaiseFor(g.amountPaise, gstPercent),
    issue_date: g.issueDate || null,
    due_date: g.dueDate || null,
    status: "raised",
  }));
}

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
    renewal_date_override: input.renewalDateOverride || null,
    payment_terms_id: input.paymentTermsId || null,
    renewal_po_type_id: input.renewalPoTypeId || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("renewals").update(patch).eq("id", renewalId);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "update", renewalId, before, patch);

  // Value or override-date edits change this cycle's schedule (spec §7). Rebuild
  // just this cycle; writes only revenue_schedule.
  try {
    await regenerateScheduleForRenewalCycle(supabase, renewalId);
  } catch {
    /* best-effort; nightly recompute / backfill will reconcile */
  }

  revalidatePath(`/sites/${siteId}`);
  return {};
}

// Mark a renewal complete. Requires both a renewal value and a received date.
// This ONLY flips the status — invoices are no longer auto-generated here; the
// user reviews the previewed schedule and generates them explicitly from the
// renewal card (see generateRenewalInvoices).
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

  // A renewal marked done retroactively recognises its elapsed months (spec §5).
  // Rebuild just this cycle's schedule; writes only revenue_schedule.
  try {
    await regenerateScheduleForRenewalCycle(supabase, renewalId);
  } catch {
    /* best-effort; nightly recompute / backfill will reconcile */
  }

  revalidatePath(`/sites/${siteId}`);
  return {};
}

// Generate (or regenerate) a renewal year's invoices from its CURRENT payment
// term, spacing periods/due dates from `anchorDate` (the renewal DATE, passed in
// so it matches the schedule previewed on the card). Handles both the first
// generation and a later rebuild after a term change — on a rebuild it replaces
// the existing UNPAID invoices.
//
// Safety: only ever removes UNPAID invoices, and never deletes — the old ones
// are cancelled (kept for history, excluded from money totals). If any existing
// invoice already has a payment, it refuses and names them so nothing paid is
// touched. Fully audited.
export async function generateRenewalInvoices(
  renewalId: string,
  siteId: string,
  anchorDate: string | null,
): Promise<ActionResult & { cancelled?: number; created?: number }> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to regenerate invoices." };
  }

  const supabase = await createClient();
  const before = await snapshot(supabase, renewalId);
  if (!before) return { error: "Renewal not found." };

  // Build the fresh schedule FIRST — if the current term yields nothing, refuse
  // before touching anything, so we never cancel the old invoices for nothing.
  const payload = await buildRenewalInvoicePayload(supabase, before, anchorDate);
  if (payload.length === 0) {
    return {
      error:
        "Add a payment term and renewal value before generating this year's invoices.",
    };
  }

  // Existing live (non-cancelled) invoices for this renewal.
  const { data: active } = await supabase
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("renewal_id", renewalId)
    .neq("status", "cancelled");
  const activeList = (active ?? []) as {
    id: string;
    invoice_number: string;
    status: string;
  }[];

  // Refuse if any of them already has a payment — never disturb collected money.
  if (activeList.length > 0) {
    const ids = activeList.map((i) => i.id);
    const { data: paid } = await supabase
      .from("payments")
      .select("invoice_id")
      .in("invoice_id", ids);
    const paidSet = new Set((paid ?? []).map((p) => p.invoice_id as string));
    const paidNumbers = activeList
      .filter((i) => paidSet.has(i.id))
      .map((i) => i.invoice_number);
    if (paidNumbers.length > 0) {
      const one = paidNumbers.length === 1;
      return {
        error: `Can't regenerate — ${paidNumbers.join(", ")} already ${
          one ? "has a payment" : "have payments"
        } recorded. Handle ${one ? "it" : "them"} first, then try again.`,
      };
    }
  }

  // Cancel the old unpaid invoices (soft-delete, keep history). Cancel-first then
  // insert: if the insert fails, re-running recovers cleanly (the cancelled ones
  // no longer block, and a fresh set is created).
  for (const inv of activeList) {
    const { error: cancelErr } = await supabase
      .from("invoices")
      .update({ status: "cancelled" })
      .eq("id", inv.id);
    if (cancelErr) return { error: cancelErr.message };
    await supabase.from("audit_log").insert({
      actor_id: user!.id,
      action: "update",
      entity_type: "invoice",
      entity_id: inv.id,
      before: { status: inv.status },
      after: { status: "cancelled", reason: "superseded by payment-term regenerate" },
    });
  }

  // Insert the fresh schedule.
  const { data: inserted, error } = await supabase
    .from("invoices")
    .insert(payload)
    .select("id, invoice_number, amount_paise, gst_amount_paise, issue_date, due_date");
  if (error || !inserted) {
    return { error: error?.message ?? "Could not regenerate the invoices." };
  }
  for (const inv of inserted) {
    await supabase.from("audit_log").insert({
      actor_id: user!.id,
      action: "create",
      entity_type: "invoice",
      entity_id: inv.id,
      before: null,
      after: { ...inv, po_id: payload[0].po_id, renewal_id: renewalId, billed_site_id: payload[0].billed_site_id },
    });
  }

  revalidatePath(`/sites/${siteId}`);
  return { cancelled: activeList.length, created: inserted.length };
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
