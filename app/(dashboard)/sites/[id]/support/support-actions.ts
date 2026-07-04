"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";

// Same permission rule the rest of the ops flow uses (admin/manager).
const canEditSupport = canEditCatalogs;

type ActionResult = { error?: string; id?: string };

export type SupportTicketInput = {
  ticketRef: string | null;
  subject: string;
  openedDate: string | null; // YYYY-MM-DD; null → DB default (today)
  closedDate: string | null; // YYYY-MM-DD; null → still open
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
    entity_type: "support_ticket",
    entity_id: entityId,
    before,
    after,
  });
}

// Validate the opened/closed pair. Returns an error message or null.
function validateDates(openedDate: string | null, closedDate: string | null) {
  if (closedDate && openedDate && closedDate < openedDate) {
    return "The close date can't be before the open date.";
  }
  return null;
}

// Log a new support ticket.
export async function createSupportTicket(
  siteId: string,
  input: SupportTicketInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSupport(user)) {
    return { error: "You don't have permission to log support tickets." };
  }

  const subject = input.subject?.trim();
  if (!subject) return { error: "Enter what the ticket is about." };
  const dateError = validateDates(input.openedDate, input.closedDate);
  if (dateError) return { error: dateError };

  const supabase = await createClient();
  const row: Record<string, unknown> = {
    site_id: siteId,
    ticket_ref: input.ticketRef?.trim() || null,
    subject,
    closed_date: input.closedDate || null,
    created_by: user!.id,
  };
  // Only set opened_date when provided, so the DB default (today) applies otherwise.
  if (input.openedDate) row.opened_date = input.openedDate;

  const { data, error } = await supabase
    .from("support_tickets")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not log the support ticket." };
  }

  await writeAudit(supabase, user!.id, "create", data.id, null, row);
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/support`);
  return { id: data.id };
}

// Edit an existing ticket (e.g. add the close date when it's resolved).
export async function updateSupportTicket(
  siteId: string,
  ticketId: string,
  input: SupportTicketInput,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSupport(user)) {
    return { error: "You don't have permission to edit support tickets." };
  }

  const subject = input.subject?.trim();
  if (!subject) return { error: "Enter what the ticket is about." };
  const dateError = validateDates(input.openedDate, input.closedDate);
  if (dateError) return { error: dateError };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (!before) return { error: "Ticket not found." };

  const patch: Record<string, unknown> = {
    ticket_ref: input.ticketRef?.trim() || null,
    subject,
    opened_date: input.openedDate || (before as { opened_date: string }).opened_date,
    closed_date: input.closedDate || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "update",
    ticketId,
    before as Record<string, unknown>,
    { ...(before as Record<string, unknown>), ...patch },
  );
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/support`);
  return { id: ticketId };
}

// Soft-delete: hide from the list but keep the row (CLAUDE.md).
export async function deleteSupportTicket(
  siteId: string,
  ticketId: string,
): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!canEditSupport(user)) {
    return { error: "You don't have permission to delete support tickets." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (!before) return { error: "Ticket not found." };

  const patch = {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId);
  if (error) return { error: error.message };

  await writeAudit(
    supabase,
    user!.id,
    "delete",
    ticketId,
    before as Record<string, unknown>,
    { ...(before as Record<string, unknown>), ...patch },
  );
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/support`);
  return { id: ticketId };
}
