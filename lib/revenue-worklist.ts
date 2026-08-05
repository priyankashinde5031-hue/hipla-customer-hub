// Data-quality worklist logic (MRR/ARR spec §9). Pure classification of which
// line items produce no revenue schedule (or rest on a shaky anchor), so the
// /revenue/unrecognised screen can group them by reason and total the ₹ at risk.
// No DB here — unit-testable in isolation.

export type WorklistReason =
  | "no_anchor" // no actual go-live AND no expected delivery on the PO
  | "no_method" // has an anchor, but no recognition method chosen
  | "coverage_review"; // multi-year term but coverage_months still at the 12 default

export const REASON_LABEL: Record<WorklistReason, string> = {
  no_anchor: "No date — needs a go-live or expected delivery date",
  no_method: "No recognition method chosen",
  coverage_review: "Multi-year PO — check coverage months",
};

export type LineItemClassifyInput = {
  recognitionMethod: string | null;
  coverageMonths: number;
  revenueExcluded: boolean;
  hasGoLive: boolean;
  hasExpected: boolean;
  contractTermMonths: number | null;
};

// Returns the reason a line item is not cleanly recognised, or null if it is
// fine (or deliberately excluded). Order matters: a missing anchor is the
// blocking problem; only once anchored does a missing method surface; only once
// both are present does coverage become worth reviewing.
export function classifyLineItem(i: LineItemClassifyInput): WorklistReason | null {
  if (i.revenueExcluded) return null; // deliberately held out — not "at risk"
  const hasAnchor = i.hasGoLive || i.hasExpected;
  if (!hasAnchor) return "no_anchor";
  if (!i.recognitionMethod) return "no_method";
  // A multi-year single PO must set coverage to the full span (36/60). If the
  // term runs beyond a year but coverage is still the 12 default, flag it for a
  // human to confirm (spec §6, §9). Not a hard error — 12 may be intended.
  if ((i.contractTermMonths ?? 12) > 12 && i.coverageMonths <= 12) {
    return "coverage_review";
  }
  return null;
}

// A renewal cycle that is past its start date but still not marked done is a
// data-quality signal (the pipeline value is stuck as projected). "Today" is a
// year-month string "YYYY-MM"; the renewal's effective start is likewise.
export function isRenewalOverdue(
  startYearMonth: string | null,
  status: string,
  currentYearMonth: string,
): boolean {
  if (status === "renewed") return false;
  if (!startYearMonth) return false; // no anchor yet → shows under the PO, not here
  return startYearMonth < currentYearMonth;
}
