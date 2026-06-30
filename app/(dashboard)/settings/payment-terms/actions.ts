"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

export type InstallmentInput = { label: string; percent: number };

export type PaymentTermInput = {
  name: string;
  scheduleType: "periodic" | "milestone";
  invoicesPerYear: number | null;
  timing: "advance" | "arrears";
  billingScheduleDays: number | null;
  installments: InstallmentInput[];
};

type ActionResult = { error?: string };

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: "create" | "update" | "soft_delete",
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: "payment_term",
    entity_id: entityId,
    before,
    after,
  });
}

// Shared validation. Returns the DB-ready row + cleaned installments, or an error.
function validate(input: PaymentTermInput): {
  error?: string;
  row?: Record<string, unknown>;
  installments?: InstallmentInput[];
} {
  const name = input.name?.trim();
  if (!name) return { error: "Name is required." };

  if (
    input.billingScheduleDays !== null &&
    (!Number.isInteger(input.billingScheduleDays) || input.billingScheduleDays < 0)
  ) {
    return { error: "Billing schedule (days to clear) must be 0 or more." };
  }

  if (input.scheduleType === "periodic") {
    const ipy = input.invoicesPerYear;
    if (ipy === null || !Number.isInteger(ipy) || ipy <= 0) {
      return { error: "Invoices per year must be a whole number greater than zero." };
    }
    return {
      row: {
        name,
        schedule_type: "periodic",
        invoices_per_year: ipy,
        timing: input.timing,
        billing_schedule_days: input.billingScheduleDays,
      },
      installments: [],
    };
  }

  // milestone
  const cleaned = (input.installments ?? [])
    .map((i) => ({ label: i.label?.trim() ?? "", percent: i.percent }))
    .filter((i) => i.label !== "" || i.percent);

  if (cleaned.length === 0) {
    return { error: "Add at least one milestone stage." };
  }
  for (const i of cleaned) {
    if (!i.label) return { error: "Every milestone stage needs a name." };
    if (!Number.isFinite(i.percent) || i.percent <= 0 || i.percent > 100) {
      return { error: `Percentage for "${i.label}" must be between 0 and 100.` };
    }
  }
  const sum = cleaned.reduce((acc, i) => acc + i.percent, 0);
  if (Math.abs(sum - 100) > 0.001) {
    return { error: `Milestone percentages must add up to 100% (currently ${sum}%).` };
  }

  return {
    row: {
      name,
      schedule_type: "milestone",
      invoices_per_year: null,
      timing: input.timing,
      billing_schedule_days: input.billingScheduleDays,
    },
    installments: cleaned,
  };
}

async function replaceInstallments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  termId: string,
  installments: InstallmentInput[],
): Promise<string | null> {
  await supabase.from("payment_term_installments").delete().eq("payment_term_id", termId);
  if (installments.length === 0) return null;
  const { error } = await supabase.from("payment_term_installments").insert(
    installments.map((inst, idx) => ({
      payment_term_id: termId,
      sort_order: idx + 1,
      label: inst.label.trim(),
      percent: inst.percent,
    })),
  );
  return error ? error.message : null;
}

export async function createPaymentTerm(input: PaymentTermInput): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCatalogs(user)) return { error: "You don't have permission to edit payment terms." };

  const { error, row, installments } = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("payment_terms")
    .select("id")
    .ilike("name", row!.name as string)
    .maybeSingle();
  if (existing) return { error: "A payment term with this name already exists." };

  const { data: inserted, error: insertError } = await supabase
    .from("payment_terms")
    .insert(row!)
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Could not create the payment term." };
  }

  const childErr = await replaceInstallments(supabase, inserted.id, installments!);
  if (childErr) return { error: childErr };

  await writeAudit(supabase, user!.id, "create", inserted.id, null, {
    ...row,
    installments,
  });
  revalidatePath("/settings/payment-terms");
  return {};
}

export async function updatePaymentTerm(id: string, input: PaymentTermInput): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCatalogs(user)) return { error: "You don't have permission to edit payment terms." };

  const { error, row, installments } = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("payment_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Payment term not found." };

  const { data: clash } = await supabase
    .from("payment_terms")
    .select("id")
    .ilike("name", row!.name as string)
    .neq("id", id)
    .maybeSingle();
  if (clash) return { error: "A payment term with this name already exists." };

  const { error: updateError } = await supabase.from("payment_terms").update(row!).eq("id", id);
  if (updateError) return { error: updateError.message };

  const childErr = await replaceInstallments(supabase, id, installments!);
  if (childErr) return { error: childErr };

  await writeAudit(supabase, user!.id, "update", id, before, { ...row, installments });
  revalidatePath("/settings/payment-terms");
  return {};
}

export async function setPaymentTermActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditCatalogs(user)) return { error: "You don't have permission to edit payment terms." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("payment_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Payment term not found." };

  const { error } = await supabase.from("payment_terms").update({ active }).eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, user!.id, "soft_delete", id, before, { ...before, active });
  revalidatePath("/settings/payment-terms");
  return {};
}
