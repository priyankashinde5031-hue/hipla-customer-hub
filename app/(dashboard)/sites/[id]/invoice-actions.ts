"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { buildSchedule, type PaymentTermSpec } from "@/lib/invoicing";

// Same rule as PO edits: admin or manager (spec uses it for commercial edits).
const canEditCommercials = canEditCatalogs;

type ActionResult = { error?: string; count?: number };

export type NewInvoiceRow = {
  amountPaise: number; // ex-tax
  gstAmountPaise: number;
  issueDate: string | null; // yyyy-mm-dd
  dueDate: string | null;
};

export type SingleInvoiceInput = {
  amountRupees: number;
  gstNumber: string | null;
  gstAmountRupees: number;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
};

export type PaymentInput = {
  amountRupees: number;
  receivedDate: string; // yyyy-mm-dd, required
  mode: string | null;
  reference: string | null;
};

export type InvoiceEditInput = {
  status: string; // one of the manually-settable statuses below
  issueDate: string | null;
  dueDate: string | null;
};

// Statuses a user sets by hand. due / overdue / part-paid / cleared are derived
// by the invoice_balances view, so they are not offered for manual selection.
const MANUAL_STATUSES = ["draft", "raised", "cancelled"];

const VALID_STATUSES = [
  "draft",
  "raised",
  "due",
  "overdue",
  "part-paid",
  "cleared",
  "cancelled",
];

function rupeesToPaise(rupees: number): number | null {
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

async function getPoContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poId: string,
): Promise<{ contract_id: string | null; siteIds: string[] } | null> {
  const { data } = await supabase
    .from("purchase_orders")
    .select("id, contract_id, po_sites ( site_id )")
    .eq("id", poId)
    .maybeSingle();
  if (!data) return null;
  const siteIds = ((data.po_sites as { site_id: string }[] | null) ?? []).map((s) => s.site_id);
  return { contract_id: data.contract_id ?? null, siteIds };
}

function revalidateSites(originSiteId: string, billedSiteId: string) {
  revalidatePath(`/sites/${originSiteId}`);
  if (billedSiteId !== originSiteId) revalidatePath(`/sites/${billedSiteId}`);
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  invoiceId: string,
  after: Record<string, unknown>,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action: "create",
    entity_type: "invoice",
    entity_id: invoiceId,
    before: null,
    after,
  });
}

// Bulk-create the invoices generated from a PO's payment-term schedule.
export async function createInvoices(
  poId: string,
  billedSiteId: string,
  originSiteId: string,
  rows: NewInvoiceRow[],
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to create invoices." };
  }

  if (!rows || rows.length === 0) return { error: "No invoices to create." };
  for (const r of rows) {
    if (!Number.isFinite(r.amountPaise) || r.amountPaise < 0) {
      return { error: "Every invoice amount must be zero or more." };
    }
    if (!Number.isFinite(r.gstAmountPaise) || r.gstAmountPaise < 0) {
      return { error: "GST amount cannot be negative." };
    }
  }

  const supabase = await createClient();
  const ctx = await getPoContext(supabase, poId);
  if (!ctx) return { error: "Purchase order not found." };
  if (!ctx.siteIds.includes(billedSiteId)) {
    return { error: "Invoices can only be billed to a site this PO covers." };
  }

  const payload = rows.map((r) => ({
    po_id: poId,
    contract_id: ctx.contract_id,
    billed_site_id: billedSiteId,
    amount_paise: r.amountPaise,
    gst_amount_paise: r.gstAmountPaise,
    issue_date: r.issueDate || null,
    due_date: r.dueDate || null,
    status: "raised",
  }));

  const { data: inserted, error } = await supabase
    .from("invoices")
    .insert(payload)
    .select("id, invoice_number, amount_paise, gst_amount_paise, issue_date, due_date");

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the invoices." };
  }

  for (const inv of inserted) {
    await writeAudit(supabase, user!.id, inv.id, { ...inv, po_id: poId, billed_site_id: billedSiteId });
  }

  revalidateSites(originSiteId, billedSiteId);
  return { count: inserted.length };
}

// Create a single, manually-entered invoice against a PO.
export async function createSingleInvoice(
  poId: string,
  billedSiteId: string,
  originSiteId: string,
  input: SingleInvoiceInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to create invoices." };
  }

  const amountPaise = rupeesToPaise(input.amountRupees);
  if (amountPaise === null) return { error: "Amount must be zero or more." };

  const gstPaise = rupeesToPaise(input.gstAmountRupees);
  if (gstPaise === null) return { error: "GST amount must be zero or more." };

  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid invoice status." };
  }

  const supabase = await createClient();
  const ctx = await getPoContext(supabase, poId);
  if (!ctx) return { error: "Purchase order not found." };
  if (!ctx.siteIds.includes(billedSiteId)) {
    return { error: "Invoices can only be billed to a site this PO covers." };
  }

  const row = {
    po_id: poId,
    contract_id: ctx.contract_id,
    billed_site_id: billedSiteId,
    amount_paise: amountPaise,
    gst_number: input.gstNumber?.trim() || null,
    gst_amount_paise: gstPaise,
    issue_date: input.issueDate || null,
    due_date: input.dueDate || null,
    status: input.status,
  };

  const { data: inserted, error } = await supabase
    .from("invoices")
    .insert(row)
    .select("id, invoice_number")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the invoice." };
  }

  await writeAudit(supabase, user!.id, inserted.id, { ...row });

  revalidateSites(originSiteId, billedSiteId);
  return { count: 1 };
}

// Edit an invoice's manual status and its issue/due dates. Amounts are not
// editable here (they come from the PO split / single-invoice entry).
export async function updateInvoice(
  invoiceId: string,
  originSiteId: string,
  input: InvoiceEditInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to edit invoices." };
  }
  if (!MANUAL_STATUSES.includes(input.status)) {
    return { error: "Pick a valid status (Draft, Raised or Cancelled)." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!before) return { error: "Invoice not found." };

  const patch = {
    status: input.status,
    issue_date: input.issueDate || null,
    due_date: input.dueDate || null,
  };

  const { error } = await supabase.from("invoices").update(patch).eq("id", invoiceId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user!.id,
    action: "update",
    entity_type: "invoice",
    entity_id: invoiceId,
    before,
    after: { ...before, ...patch },
  });

  revalidatePath(`/sites/${originSiteId}`);
  return { count: 1 };
}

// Record a payment received against an invoice. The invoice's paid/balance and
// computed status (cleared / part-paid / overdue) are derived by the
// invoice_balances view, so nothing is hand-totaled here.
export async function recordPayment(
  invoiceId: string,
  originSiteId: string,
  input: PaymentInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to record payments." };
  }

  const amountPaise = rupeesToPaise(input.amountRupees);
  if (amountPaise === null || amountPaise <= 0) {
    return { error: "Payment amount must be greater than zero." };
  }
  if (!input.receivedDate) {
    return { error: "A received date is required." };
  }

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found." };

  const row = {
    invoice_id: invoiceId,
    amount_paise: amountPaise,
    received_date: input.receivedDate,
    mode: input.mode?.trim() || null,
    reference: input.reference?.trim() || null,
  };

  const { data: inserted, error } = await supabase
    .from("payments")
    .insert(row)
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: error?.message ?? "Could not record the payment." };
  }

  await supabase.from("audit_log").insert({
    actor_id: user!.id,
    action: "create",
    entity_type: "payment",
    entity_id: inserted.id,
    before: null,
    after: row,
  });

  revalidatePath(`/sites/${originSiteId}`);
  return { count: 1 };
}

function gstPaiseFor(amountPaise: number, gstPercent: number | null): number {
  const pct = gstPercent ?? 0;
  return pct > 0 ? Math.round((amountPaise * pct) / 100) : 0;
}

// Rebuild the ORIGINAL-PO invoices (the ones not tied to a renewal year) billed
// to this site, from the PO's CURRENT payment term. The mirror of
// regenerateRenewalInvoices, for when a PO's payment term was changed after its
// invoices were first generated. Same safety: only cancels UNPAID invoices,
// never deletes, refuses if any already has a payment. Fully audited.
export async function regeneratePoInvoices(
  poId: string,
  siteId: string,
): Promise<ActionResult & { cancelled?: number; created?: number }> {
  const user = await getCurrentInternalUser();
  if (!canEditCommercials(user)) {
    return { error: "You don't have permission to regenerate invoices." };
  }

  const supabase = await createClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, gst_percent, contract_id, po_received_date, payment_terms_id, contract_time:contract_times!contract_time_id ( months ), po_sites ( site_id )",
    )
    .eq("id", poId)
    .maybeSingle();
  if (!po) return { error: "Purchase order not found." };

  const siteIds = ((po.po_sites as { site_id: string }[] | null) ?? []).map((s) => s.site_id);
  if (!siteIds.includes(siteId)) {
    return { error: "Invoices can only be billed to a site this PO covers." };
  }

  const paymentTermsId = po.payment_terms_id as string | null;
  if (!paymentTermsId) {
    return { error: "Set a payment term on the PO before regenerating its invoices." };
  }

  const { data: totals } = await supabase
    .from("po_totals")
    .select("po_value_paise")
    .eq("po_id", poId)
    .maybeSingle();
  const totalPaise = (totals?.po_value_paise as number | null) ?? 0;
  if (totalPaise <= 0) {
    return { error: "This PO has no line-item value to invoice." };
  }

  const { data: term } = await supabase
    .from("payment_terms")
    .select(
      "schedule_type, invoices_per_year, timing, billing_schedule_days, installments:payment_term_installments ( label, percent, sort_order )",
    )
    .eq("id", paymentTermsId)
    .maybeSingle();
  if (!term) return { error: "Payment term not found." };

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

  const contractTime = Array.isArray(po.contract_time) ? po.contract_time[0] : po.contract_time;
  const generated = buildSchedule({
    totalPaise,
    term: spec,
    contractMonths: (contractTime?.months as number | null) ?? 12,
    startDate:
      spec.scheduleType === "periodic" ? (po.po_received_date as string | null) : null,
  });
  if (generated.length === 0) {
    return { error: "This payment term produces no invoice schedule." };
  }

  const gstPercent = (po.gst_percent as number | null) ?? null;
  const payload = generated.map((g) => ({
    po_id: poId,
    contract_id: (po.contract_id as string | null) ?? null,
    billed_site_id: siteId,
    renewal_id: null,
    amount_paise: g.amountPaise,
    gst_amount_paise: gstPaiseFor(g.amountPaise, gstPercent),
    issue_date: g.issueDate || null,
    due_date: g.dueDate || null,
    status: "raised",
  }));

  // Existing live original-PO invoices billed to this site (renewal invoices are
  // handled on the renewal card, so they're excluded here).
  const { data: active } = await supabase
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("po_id", poId)
    .eq("billed_site_id", siteId)
    .is("renewal_id", null)
    .neq("status", "cancelled");
  const activeList = (active ?? []) as {
    id: string;
    invoice_number: string;
    status: string;
  }[];
  if (activeList.length === 0) {
    return {
      error: "No original-PO invoices to regenerate for this site. Use Generate invoices instead.",
    };
  }

  const ids = activeList.map((i) => i.id);
  const { data: paid } = await supabase
    .from("payments")
    .select("invoice_id")
    .in("invoice_id", ids);
  const paidSet = new Set((paid ?? []).map((p) => p.invoice_id as string));
  const paidNumbers = activeList.filter((i) => paidSet.has(i.id)).map((i) => i.invoice_number);
  if (paidNumbers.length > 0) {
    const one = paidNumbers.length === 1;
    return {
      error: `Can't regenerate — ${paidNumbers.join(", ")} already ${
        one ? "has a payment" : "have payments"
      } recorded. Handle ${one ? "it" : "them"} first, then try again.`,
    };
  }

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

  const { data: inserted, error } = await supabase
    .from("invoices")
    .insert(payload)
    .select("id, invoice_number, amount_paise, gst_amount_paise, issue_date, due_date");
  if (error || !inserted) {
    return { error: error?.message ?? "Could not regenerate the invoices." };
  }
  for (const inv of inserted) {
    await writeAudit(supabase, user!.id, inv.id, { ...inv, po_id: poId, billed_site_id: siteId });
  }

  revalidatePath(`/sites/${siteId}`);
  return { cancelled: activeList.length, created: inserted.length };
}
