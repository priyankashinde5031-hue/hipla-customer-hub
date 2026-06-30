"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

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
): Promise<{ contract_id: string | null } | null> {
  const { data } = await supabase
    .from("purchase_orders")
    .select("id, contract_id")
    .eq("id", poId)
    .maybeSingle();
  return data ? { contract_id: data.contract_id ?? null } : null;
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

  const payload = rows.map((r) => ({
    po_id: poId,
    contract_id: ctx.contract_id,
    billed_site_id: originSiteId,
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
    await writeAudit(supabase, user!.id, inv.id, { ...inv, po_id: poId, billed_site_id: originSiteId });
  }

  revalidatePath(`/sites/${originSiteId}`);
  return { count: inserted.length };
}

// Create a single, manually-entered invoice against a PO.
export async function createSingleInvoice(
  poId: string,
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

  const row = {
    po_id: poId,
    contract_id: ctx.contract_id,
    billed_site_id: originSiteId,
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

  revalidatePath(`/sites/${originSiteId}`);
  return { count: 1 };
}
