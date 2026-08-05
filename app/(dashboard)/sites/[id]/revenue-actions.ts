"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import {
  regenerateScheduleForLineItem,
  regenerateScheduleForRenewalCycle,
} from "@/lib/revenue-schedule";
import type { RecognitionMethod } from "@/lib/revenue-engine";

// Same "admin or manager" rule the other commercial edits use.
const canEditCommercials = canEditCatalogs;

export type ActionResult = { error?: string; ok?: boolean };

const METHODS: RecognitionMethod[] = ["saas", "capex", "opex", "one_time"];

// Set (or clear) the recognition method / coverage on ONE PO line item, then
// re-materialise that line's schedule (spec §7 trigger: method/coverage change).
//
// SAFETY: writes only the recognition columns on this one line item, and
// delete+reinserts THIS line's rows in revenue_schedule. No other row is touched.
export async function setLineItemRecognition(input: {
  lineItemId: string;
  siteId: string;
  method: RecognitionMethod | null;
  coverageMonths?: number | null;
  revenueExcluded?: boolean;
  exclusionReason?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!user) return { error: "Not signed in." };
  if (!canEditCommercials(user)) {
    return { error: "You do not have permission to edit revenue recognition." };
  }

  if (input.method !== null && !METHODS.includes(input.method)) {
    return { error: "Unknown recognition method." };
  }

  const coverage =
    input.coverageMonths == null || !Number.isFinite(input.coverageMonths)
      ? 12
      : Math.max(1, Math.round(input.coverageMonths));

  const supabase = await createClient();

  const patch: Record<string, unknown> = {
    recognition_method: input.method,
    coverage_months: coverage,
  };
  if (input.revenueExcluded !== undefined) {
    patch.revenue_excluded = input.revenueExcluded;
    patch.revenue_exclusion_reason = input.revenueExcluded
      ? input.exclusionReason?.trim() || null
      : null;
  }

  const { error: updErr } = await supabase
    .from("po_line_items")
    .update(patch)
    .eq("id", input.lineItemId);
  if (updErr) return { error: updErr.message };

  // Re-materialise this line's schedule from the new method/coverage.
  try {
    await regenerateScheduleForLineItem(supabase, input.lineItemId);
  } catch (e) {
    return { error: `Saved, but rebuilding the schedule failed: ${(e as Error).message}` };
  }

  revalidatePath(`/sites/${input.siteId}`);
  return { ok: true };
}

// Set the coverage (spread length, in months) of ONE renewal cycle, then
// re-materialise that cycle's SaaS schedule. The method is fixed to SaaS for
// renewals (spec §8) — only the number of months is editable here.
//
// SAFETY: updates only renewals.term_months on this one cycle and delete+rewrites
// THIS cycle's rows in revenue_schedule. No other row is touched.
export async function setRenewalCoverage(input: {
  renewalId: string;
  siteId: string;
  coverageMonths: number;
}): Promise<ActionResult> {
  const user = await getCurrentInternalUser();
  if (!user) return { error: "Not signed in." };
  if (!canEditCommercials(user)) {
    return { error: "You do not have permission to edit revenue recognition." };
  }

  const coverage = Number.isFinite(input.coverageMonths)
    ? Math.max(1, Math.round(input.coverageMonths))
    : 12;

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("renewals")
    .update({ term_months: coverage, updated_at: new Date().toISOString() })
    .eq("id", input.renewalId);
  if (updErr) return { error: updErr.message };

  try {
    await regenerateScheduleForRenewalCycle(supabase, input.renewalId);
  } catch (e) {
    return { error: `Saved, but rebuilding the schedule failed: ${(e as Error).message}` };
  }

  revalidatePath(`/sites/${input.siteId}`);
  return { ok: true };
}
