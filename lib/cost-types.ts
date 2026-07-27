// Whether a cost type's value is annually recurring or one-time. These string
// values are the single source of truth for the cost_types.recurrence column,
// the Settings dropdown options (lib/catalogs.ts), and the ARR / revenue-
// recognition maths (lib/health-metrics.ts) — keep the three in lockstep.

export const COST_RECURRENCE = {
  recurring: "Recurring", // value spreads over 12 months from go-live; enters ARR
  oneTime: "One-time", // full value recognised in the go-live month; not in ARR
} as const;

export type CostRecurrence = (typeof COST_RECURRENCE)[keyof typeof COST_RECURRENCE];
