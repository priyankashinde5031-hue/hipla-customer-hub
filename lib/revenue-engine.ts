// Revenue recognition engine — the pure core (MRR/ARR spec §3).
//
// One atom: the line item. This module turns a single line item (value, method,
// anchor month, coverage months) into month-by-month revenue rows. It has NO
// database access and NO side effects, so every rule below is unit-testable in
// isolation (spec §12: "Unit tests on the pure generator before any UI").
//
// The SAME function produces the plain-English summary string (spec §8) so the
// prose can never drift from the numbers.
//
// Money is INR, ex-GST, stored as INTEGER PAISE. Never a float. All spreading
// divides in paise, floors each instalment, and drops the remainder on the
// FIRST month so the schedule sums to exactly the line item value (spec §3).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The four recognition methods. Set the SHAPE of the schedule (spec §3).
export type RecognitionMethod = "saas" | "capex" | "opex" | "one_time";

// The component of a single schedule row. `is_recurring` (spec §7, §10) is
// derived from this: saas / capex_tail / opex are recurring; capex_upfront and
// one_time are not. Recurring components are the ONLY input to run-rate ARR.
export type RevenueComponent =
  | "saas"
  | "capex_upfront"
  | "capex_tail"
  | "opex"
  | "one_time";

export const RECURRING_COMPONENTS: RevenueComponent[] = [
  "saas",
  "capex_tail",
  "opex",
];

export function isRecurringComponent(component: RevenueComponent): boolean {
  return RECURRING_COMPONENTS.includes(component);
}

// One row of the schedule: an amount of revenue recognised in one month for one
// component. `month` is a year-month string "YYYY-MM" — day-level detail is
// deliberately dropped (spec §3: "No day-level proration").
export type ScheduleRow = {
  month: string; // "YYYY-MM"
  component: RevenueComponent;
  amount: number; // integer paise
};

// ---------------------------------------------------------------------------
// Month arithmetic on "YYYY-MM" (no Date(), so no timezone day-shift; only the
// year-month of the anchor ever matters — spec §3).
// ---------------------------------------------------------------------------

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Accepts "YYYY-MM" or "YYYY-MM-DD" (any day) and returns the "YYYY-MM" part.
// Returns null for anything that isn't a valid year-month.
export function toYearMonth(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(input.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}`;
}

// Add a whole number of months to a "YYYY-MM", returning "YYYY-MM".
export function addYearMonths(yearMonth: string, months: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`addYearMonths: invalid year-month "${yearMonth}"`);
  const year = Number(m[1]);
  const monthZero = Number(m[2]) - 1 + months;
  const targetYear = year + Math.floor(monthZero / 12);
  const targetMonth = ((monthZero % 12) + 12) % 12; // 0-11
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
}

// "May-25" — the compact month label used in summary strings (spec §8).
export function formatMonthShort(yearMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) return yearMonth;
  return `${MONTH_ABBR[Number(m[2]) - 1]}-${m[1].slice(2)}`;
}

// ---------------------------------------------------------------------------
// Rounding — spec §3
//   Divide in paise, floor each instalment, add the whole remainder to the
//   FIRST month so the schedule sums to EXACTLY the line item value. Test with a
//   value not divisible by the divisor (e.g. ₹1,00,000 / 12).
// ---------------------------------------------------------------------------

// Returns `count` integer instalments that sum to exactly `totalPaise`.
function splitEvenPaise(totalPaise: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count; // 0..count-1 paise
  const out = new Array<number>(count).fill(base);
  out[0] += remainder; // whole remainder on the first month (spec §3)
  return out;
}

// ---------------------------------------------------------------------------
// The generator (spec §3)
//   (value, method, anchorMonth, coverageMonths) => [{ month, component, amount }]
//
// Every method receives coverageMonths; each uses it in its own way, or ignores
// it (one_time). coverageMonths defaults to 12.
// ---------------------------------------------------------------------------

const CAPEX_UPFRONT_RATIO = 0.8; // 80% upfront, 20% spread as the tail (spec §3)

export function generateSchedule(
  valuePaise: number,
  method: RecognitionMethod,
  anchor: string, // "YYYY-MM" or "YYYY-MM-DD"
  coverageMonths = 12,
): ScheduleRow[] {
  const anchorMonth = toYearMonth(anchor);
  if (anchorMonth === null) {
    throw new Error(`generateSchedule: invalid anchor "${anchor}"`);
  }
  const value = Math.round(valuePaise);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`generateSchedule: invalid value "${valuePaise}"`);
  }
  const coverage = Number.isFinite(coverageMonths) && coverageMonths > 0
    ? Math.round(coverageMonths)
    : 12;

  switch (method) {
    case "one_time":
      // Full value in the anchor month, single row. coverage ignored (spec §3).
      return [{ month: anchorMonth, component: "one_time", amount: value }];

    case "saas": {
      const parts = splitEvenPaise(value, coverage);
      return parts.map((amount, i) => ({
        month: addYearMonths(anchorMonth, i),
        component: "saas" as const,
        amount,
      }));
    }

    case "opex": {
      const parts = splitEvenPaise(value, coverage);
      return parts.map((amount, i) => ({
        month: addYearMonths(anchorMonth, i),
        component: "opex" as const,
        amount,
      }));
    }

    case "capex": {
      // 80% upfront in the anchor month + a 20% tail spread over `coverage`
      // months BEGINNING in the anchor month (spec §3). Upfront is rounded to
      // whole paise; the tail carries whatever balances the total, so the
      // schedule sums to exactly `value`.
      const upfront = Math.round(value * CAPEX_UPFRONT_RATIO);
      const tailTotal = value - upfront;
      const tailParts = splitEvenPaise(tailTotal, coverage);
      const rows: ScheduleRow[] = [
        { month: anchorMonth, component: "capex_upfront", amount: upfront },
      ];
      tailParts.forEach((amount, i) => {
        rows.push({
          month: addYearMonths(anchorMonth, i),
          component: "capex_tail",
          amount,
        });
      });
      return rows;
    }

    default: {
      // Exhaustiveness guard — a new method must be handled explicitly.
      const _never: never = method;
      throw new Error(`generateSchedule: unknown method "${_never}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary string (spec §8) — built from the SAME numbers as the schedule, so
// prose and figures can never disagree.
//
//   ₹10,00,000 · Capex · ₹8,00,000 in May-25, then ₹16,667/mo → Apr-26
//   ₹1,44,000 · Opex · ₹12,000/mo · Nov-24 → Oct-25
//   ₹1,20,000 · SaaS · ₹10,000/mo · Jun-26 → May-27
//   ₹10,000 · One-Time · ₹10,000 in Jan-25
//
// Amounts render in whole rupees with Indian digit grouping (the sub-rupee
// paise remainder from spreading is a ledger detail, not shown in the summary).
// Callers append status suffixes ("· ✓ Renewal done", "· scope change",
// "· 3-yr prepaid") separately.
// ---------------------------------------------------------------------------

const METHOD_LABEL: Record<RecognitionMethod, string> = {
  saas: "SaaS",
  capex: "Capex",
  opex: "Opex",
  one_time: "One-Time",
};

// Whole-rupee ₹ with Indian grouping, e.g. 1666700 paise -> "₹16,667".
function rupeesGrouped(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function summarizeSchedule(
  valuePaise: number,
  method: RecognitionMethod,
  anchor: string,
  coverageMonths = 12,
): string {
  const rows = generateSchedule(valuePaise, method, anchor, coverageMonths);
  const value = rupeesGrouped(Math.round(valuePaise));
  const label = METHOD_LABEL[method];

  if (method === "one_time") {
    return `${value} · ${label} · ${value} in ${formatMonthShort(rows[0].month)}`;
  }

  if (method === "capex") {
    const upfront = rows.find((r) => r.component === "capex_upfront")!;
    const tail = rows.filter((r) => r.component === "capex_tail");
    const lastTail = tail[tail.length - 1];
    // The representative monthly tail (whole rupees) — the divisible cases show
    // a clean figure; non-divisible cases show the rounded instalment.
    const perMonth = rupeesGrouped(Math.round((valuePaise * (1 - CAPEX_UPFRONT_RATIO)) / (tail.length || 1)));
    return (
      `${value} · ${label} · ${rupeesGrouped(upfront.amount)} in ${formatMonthShort(upfront.month)}, ` +
      `then ${perMonth}/mo → ${formatMonthShort(lastTail.month)}`
    );
  }

  // saas / opex — a flat monthly spread.
  const perMonth = rupeesGrouped(Math.round(Math.round(valuePaise) / (rows.length || 1)));
  const first = rows[0].month;
  const last = rows[rows.length - 1].month;
  return `${value} · ${label} · ${perMonth}/mo · ${formatMonthShort(first)} → ${formatMonthShort(last)}`;
}
