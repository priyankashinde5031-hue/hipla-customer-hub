// Tunable thresholds for the CEO dashboard. Kept as named constants (never
// inline literals) so the owner can change the triage rules in one place — per
// the dashboard spec §5 ("Thresholds must be named constants, confirm real
// values with the data owner") and CLAUDE.md.
//
// Values confirmed with Priyanka (2026-07-05): spec defaults.

// Usage: a customer is "below expected" (surfaced on the dashboard) when its
// latest-week deviation is at least this far below expected. −25 = 25% under.
export const USAGE_DEVIATION_ALERT_PCT = -25;

// Implementation: a project is "at risk" if its current stage has been in
// progress for this many days or more (or it is past its target go-live).
export const STAGE_STALL_DAYS = 14;

// Renewals: how far ahead an upcoming (not-yet-overdue) renewal is surfaced as
// pipeline on the dashboard + the Renewals page "Upcoming" filter. Owner ask
// (2026-07-05, revised): renewals due in the next 30 days.
export const RENEWAL_UPCOMING_DAYS = 30;

// Invoices: how far ahead a not-yet-overdue invoice is surfaced as pipeline.
// Owner ask: invoices due in the next 30 days ("due this month").
export const INVOICE_UPCOMING_DAYS = 30;

// Every dashboard panel shows at most this many rows; the rest lives behind
// "View all →" on the module page (spec §5: "Cap dashboard panels at 5 rows").
export const PANEL_ROW_CAP = 5;
