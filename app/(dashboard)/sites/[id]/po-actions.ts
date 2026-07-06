"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { generateRenewalSchedule, renewalExpectedPaise, type RenewalLine } from "@/lib/renewals";

// canEditCatalogs already encodes "admin or manager", the same rule the spec
// uses for commercial edits — reuse it rather than inventing a parallel check.
const canEditCommercials = canEditCatalogs;

export type PoLineItemInput = {
  description: string;
  qty: number; // positive
  unitPriceRupees: number; // entered in ₹, converted to paise here
  productId: string | null; // catalogue product; null when a custom / one-off line
  productCategoryId: string | null; // Software / Hardware / Change Request …
  costTypeId: string | null; // cost type now lives per line item, not per PO
  renewalTermId: string | null; // Annually 12% escalation / Hardware one-time / …
};

// DB-ready line-item row (paise + catalogue ids), produced by validate().
type LineRow = {
  description: string;
  qty: number;
  unit_price_paise: number;
  product_id: string | null;
  product_category_id: string | null;
  cost_type_id: string | null;
  renewal_term_id: string | null;
};

export type PoFormInput = {
  name: string;
  poTypeId: string | null;
  poReceivedDate: string | null; // yyyy-mm-dd
  financialYearId: string | null;
  gstPercent: number | null;
  paymentTermsId: string | null;
  contractTimeId: string | null;
  siteIds: string[];
  moduleIds: string[];
  // License count per module id (only for selected modules). Omitted / null
  // means "not recorded" — stored directly since it's entered, not derived.
  moduleLicenseCounts?: Record<string, number | null>;
  lineItems: PoLineItemInput[];
};

type ActionResult = { error?: string; poId?: string; poNumber?: string };

// Rupees (possibly fractional) -> integer paise. Round to avoid float drift
// (CLAUDE.md: money stored as integer paise). Returns null if not a clean,
// non-negative finite number.
function rupeesToPaise(rupees: number): number | null {
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

// A recorded license count is a whole, non-negative number. Anything blank or
// invalid becomes null ("not recorded"), never an error — the count is optional.
function normalizeLicenseCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

// Shared validation for create and edit. Produces DB-ready rows.
function validate(input: PoFormInput): {
  error?: string;
  po?: Record<string, unknown>;
  lineRows?: LineRow[];
} {
  const name = input.name?.trim();
  if (!name) return { error: "PO name is required." };

  if (!input.siteIds || input.siteIds.length === 0) {
    return { error: "Select at least one covered site." };
  }

  if (input.gstPercent !== null && (!Number.isFinite(input.gstPercent) || input.gstPercent < 0)) {
    return { error: "GST % cannot be negative." };
  }

  const rawItems = input.lineItems ?? [];
  const lineRows: LineRow[] = [];

  for (const item of rawItems) {
    const description = item.description?.trim();
    // Skip fully-blank rows so an accidental empty row doesn't block saving.
    const isBlank =
      !description && (item.qty === null || item.qty === undefined || item.qty === 0) &&
      (item.unitPriceRupees === null || item.unitPriceRupees === undefined || item.unitPriceRupees === 0);
    if (isBlank) continue;

    if (!description) return { error: "Every line item needs a description." };
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      return { error: `Quantity for "${description}" must be greater than zero.` };
    }
    const paise = rupeesToPaise(item.unitPriceRupees);
    if (paise === null) {
      return { error: `Unit price for "${description}" must be zero or more.` };
    }
    lineRows.push({
      description,
      qty: item.qty,
      unit_price_paise: paise,
      product_id: item.productId || null,
      product_category_id: item.productCategoryId || null,
      cost_type_id: item.costTypeId || null,
      renewal_term_id: item.renewalTermId || null,
    });
  }

  if (lineRows.length === 0) {
    return { error: "Add at least one line item — a purchase order can't be empty." };
  }

  const po: Record<string, unknown> = {
    name,
    po_type_id: input.poTypeId || null,
    // Cost type now lives on each line item, not the PO header.
    po_received_date: input.poReceivedDate || null,
    financial_year_id: input.financialYearId || null,
    gst_percent: input.gstPercent,
    payment_terms_id: input.paymentTermsId || null,
    contract_time_id: input.contractTimeId || null,
  };

  return { po, lineRows };
}

export async function createPurchaseOrder(
  organizationId: string,
  originSiteId: string,
  input: PoFormInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to create purchase orders." };
  }

  const { error, po, lineRows } = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: inserted, error: insertErr } = await supabase
    .from("purchase_orders")
    .insert({ ...po, organization_id: organizationId }) // po_number auto-generated by DB default
    .select("id, po_number")
    .single();

  if (insertErr || !inserted) {
    return { error: insertErr?.message ?? "Could not create the purchase order." };
  }

  const poId = inserted.id as string;

  const childError = await writeChildren(
    supabase,
    poId,
    input.siteIds,
    input.moduleIds,
    input.moduleLicenseCounts,
    lineRows!,
  );
  if (childError) return { error: childError };

  // Auto-generate the Year 2–5 renewal projections. The user never creates
  // these by hand — they exist as soon as the PO does (spec §5.4).
  await generateRenewals(
    supabase,
    user!.id,
    poId,
    organizationId,
    originSiteId,
    input.contractTimeId,
    lineRows!,
  );

  await writeAudit(supabase, user!.id, "create", poId, null, {
    ...po,
    organization_id: organizationId,
    po_number: inserted.po_number,
    site_ids: input.siteIds,
    module_ids: input.moduleIds,
    line_items: lineRows,
  });

  revalidatePath(`/sites/${originSiteId}`);
  return { poId, poNumber: inserted.po_number as string };
}

export async function updatePurchaseOrder(
  poId: string,
  originSiteId: string,
  input: PoFormInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to edit purchase orders." };
  }

  const { error, po, lineRows } = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  // Snapshot the full before-state for the audit trail.
  const before = await snapshotPo(supabase, poId);
  if (!before) return { error: "Purchase order not found." };

  const { error: updateErr } = await supabase
    .from("purchase_orders")
    .update(po!)
    .eq("id", poId);
  if (updateErr) return { error: updateErr.message };

  // Replace covered sites / modules / line items wholesale.
  await supabase.from("po_sites").delete().eq("po_id", poId);
  await supabase.from("po_modules").delete().eq("po_id", poId);
  await supabase.from("po_line_items").delete().eq("po_id", poId);

  const childError = await writeChildren(
    supabase,
    poId,
    input.siteIds,
    input.moduleIds,
    input.moduleLicenseCounts,
    lineRows!,
  );
  if (childError) return { error: childError };

  await writeAudit(supabase, user!.id, "update", poId, before, {
    ...po,
    site_ids: input.siteIds,
    module_ids: input.moduleIds,
    line_items: lineRows,
  });

  revalidatePath(`/sites/${originSiteId}`);
  return { poId };
}

// Generate the renewal series for a freshly-created PO. Cadence is driven by
// the PO's Contract time (months), defaulting to a yearly term when unset, and
// capped at a 5-year horizon. Expected value starts from the Year-1 PO value
// (ex-GST = sum of line items) and is escalated per year using each line's
// renewal-term escalation % (e.g. 12% annually). It stays editable on each card.
async function generateRenewals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  poId: string,
  organizationId: string,
  anchorSiteId: string,
  contractTimeId: string | null,
  lineRows: LineRow[],
): Promise<void> {
  let initialTermMonths = 12;
  if (contractTimeId) {
    const { data: ct } = await supabase
      .from("contract_times")
      .select("months")
      .eq("id", contractTimeId)
      .maybeSingle();
    if (ct?.months) initialTermMonths = ct.months;
  }

  const cycles = generateRenewalSchedule(initialTermMonths);
  if (cycles.length === 0) return; // e.g. a 5-year initial term has no renewals in-horizon

  // Look up each referenced renewal term's logic + rates, so a line renews by
  // its own basis (escalation / AMC / one-time / flat). Absent → flat.
  const termIds = [...new Set(lineRows.map((r) => r.renewal_term_id).filter((id): id is string => !!id))];
  const termById: Record<string, { logic: string | null; escalation_pct: number | null; amc_pct: number | null }> = {};
  if (termIds.length > 0) {
    const { data: terms } = await supabase
      .from("renewal_terms")
      .select("id, logic, escalation_pct, amc_pct")
      .in("id", termIds);
    for (const t of terms ?? []) {
      termById[t.id as string] = {
        logic: (t.logic as string | null) ?? null,
        escalation_pct: (t.escalation_pct as number | null) ?? null,
        amc_pct: (t.amc_pct as number | null) ?? null,
      };
    }
  }

  const renewalLines: RenewalLine[] = lineRows.map((r) => {
    const term = r.renewal_term_id ? termById[r.renewal_term_id] : undefined;
    return {
      basePaise: Math.round(r.qty * r.unit_price_paise),
      logic: term?.logic ?? null,
      escalationPct: term?.escalation_pct ?? null,
      amcPct: term?.amc_pct ?? null,
    };
  });

  const rows = cycles.map((c) => ({
    po_id: poId,
    organization_id: organizationId,
    anchor_site_id: anchorSiteId,
    year_number: c.yearNumber,
    offset_months: c.offsetMonths,
    term_months: c.termMonths,
    expected_value_paise: renewalExpectedPaise(renewalLines, c.yearNumber),
  }));

  const { error } = await supabase.from("renewals").insert(rows);
  if (error) {
    // Don't fail PO creation if renewal generation hiccups — log via audit so
    // it's visible, and the renewals can be regenerated later.
    await supabase.from("audit_log").insert({
      actor_id: actorId,
      action: "error",
      entity_type: "renewal",
      entity_id: poId,
      after: { message: error.message },
    });
    return;
  }

  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action: "create",
    entity_type: "renewal",
    entity_id: poId,
    after: {
      generated_years: cycles.map((c) => c.yearNumber),
      expected_values_paise: rows.map((r) => r.expected_value_paise),
    },
  });
}

// Upload a PO document and link it on the purchase order. Bytes go to Supabase
// Storage; the path is recorded in `attachments` (CLAUDE.md: never base64 a
// file into the DB). Called from the PO form after the PO row exists.
export async function uploadPoAttachment(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to upload PO files." };
  }

  const poId = String(formData.get("poId") || "");
  const siteId = String(formData.get("siteId") || "");
  const file = formData.get("file");
  if (!poId || !siteId) return { error: "Missing purchase order reference." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  const supabase = await createClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${poId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from("po-attachments")
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
    .from("purchase_orders")
    .update({ attachment_id: attachment.id })
    .eq("id", poId);
  if (linkErr) return { error: linkErr.message };

  await writeAudit(supabase, user!.id, "update", poId, null, {
    attachment_id: attachment.id,
    original_filename: file.name,
  });

  revalidatePath(`/sites/${siteId}`);
  return { poId };
}

async function writeChildren(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poId: string,
  siteIds: string[],
  moduleIds: string[],
  moduleLicenseCounts: Record<string, number | null> | undefined,
  lineRows: LineRow[],
): Promise<string | null> {
  if (siteIds.length > 0) {
    const { error } = await supabase
      .from("po_sites")
      .insert(siteIds.map((siteId) => ({ po_id: poId, site_id: siteId })));
    if (error) return error.message;
  }

  if (moduleIds.length > 0) {
    const { error } = await supabase.from("po_modules").insert(
      moduleIds.map((moduleId) => ({
        po_id: poId,
        module_id: moduleId,
        license_count: normalizeLicenseCount(moduleLicenseCounts?.[moduleId]),
      })),
    );
    if (error) return error.message;
  }

  const { error } = await supabase
    .from("po_line_items")
    .insert(lineRows.map((r) => ({ po_id: poId, ...r })));
  if (error) return error.message;

  return null;
}

async function snapshotPo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poId: string,
): Promise<Record<string, unknown> | null> {
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", poId)
    .maybeSingle();
  if (!po) return null;

  const [{ data: sites }, { data: modules }, { data: items }] = await Promise.all([
    supabase.from("po_sites").select("site_id").eq("po_id", poId),
    supabase.from("po_modules").select("module_id, license_count").eq("po_id", poId),
    supabase
      .from("po_line_items")
      .select(
        "description, qty, unit_price_paise, product_id, product_category_id, cost_type_id, renewal_term_id",
      )
      .eq("po_id", poId),
  ]);

  return {
    ...po,
    site_ids: (sites || []).map((s) => s.site_id),
    module_ids: (modules || []).map((m) => m.module_id),
    module_license_counts: Object.fromEntries(
      (modules || []).map((m) => [m.module_id, m.license_count]),
    ),
    line_items: items || [],
  };
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: "create" | "update",
  poId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: "purchase_order",
    entity_id: poId,
    before,
    after,
  });
}
