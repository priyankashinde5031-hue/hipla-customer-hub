// Reporting aggregation for the Revenue page and dashboard strip. Pure: takes
// already-loaded schedule rows and rolls them into FY totals, the 12 monthly
// bars, the quarterly table, and the headline numbers. No DB.
//
// ARR — HOW HIPLA DEFINES IT (owner rule, 2026-08-05):
//   ARR of a financial year = the TOTAL of EVERY revenue component the schedule
//   places INSIDE that FY (Apr–Mar) — Capex upfront lump included. It is NOT
//   "recurring revenue × 12". Whatever falls in the FY, summed, is the ARR.
//   e.g. a ₹10L Capex order, go-live Aug-2026: ₹8L upfront (Aug) + 8 months of
//   the ₹16,667 tail (Aug→Mar) = ₹9,33,333 counts in FY 2026-27; the last 4
//   tail months roll into FY 2027-28.
//
// The current-month number is likewise the TOTAL revenue landing in the current
// month (all components), not a recurring-only figure.

import { fyLabel as fyLabelForMonth, fyQuarter } from "./revenue-schedule";

// The minimal row shape the reporting needs (a subset of revenue_schedule).
export type ReportRow = {
  period_month: string; // "YYYY-MM-01" or "YYYY-MM"
  amount_paise: number;
  is_recurring: boolean;
  recognition_status: "recognised" | "projected";
};

// --- Financial-year helpers (Indian FY, Apr–Mar) ---------------------------

// The FY start year a "YYYY-MM" belongs to: Apr–Dec → that year; Jan–Mar → prev.
export function fyStartYearOf(yearMonth: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(yearMonth);
  if (!m) throw new Error(`fyStartYearOf: bad month "${yearMonth}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 4 ? year : year - 1;
}

export function currentFyStartYear(now: Date = new Date()): number {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return fyStartYearOf(local.toISOString().slice(0, 7));
}

// "FY 2026–27" from a start year.
export function fyLabelForStartYear(startYear: number): string {
  return fyLabelForMonth(`${startYear}-04`);
}

// The 12 months of an FY, "YYYY-MM", Apr(start) → Mar(start+1).
export function fyMonths(startYear: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthZero = 3 + i; // Apr = index 3 in 0-based months
    const y = startYear + Math.floor(monthZero / 12);
    const m = (monthZero % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

// Normalise "YYYY-MM-01" / "YYYY-MM" to "YYYY-MM".
function ym(period: string): string {
  return period.slice(0, 7);
}

// --- Aggregations ----------------------------------------------------------

export type MonthBar = {
  month: string; // "YYYY-MM"
  recognised: number; // paise
  projected: number; // paise
  total: number; // paise
};

// One stacked bar per FY month, in calendar order (Apr → Mar). Rows outside the
// FY are ignored, so callers can pass a whole PO's schedule safely.
export function monthlyBars(rows: ReportRow[], startYear: number): MonthBar[] {
  const months = fyMonths(startYear);
  const index = new Map(months.map((m, i) => [m, i]));
  const bars: MonthBar[] = months.map((m) => ({
    month: m,
    recognised: 0,
    projected: 0,
    total: 0,
  }));
  for (const r of rows) {
    const i = index.get(ym(r.period_month));
    if (i === undefined) continue;
    if (r.recognition_status === "recognised") bars[i].recognised += r.amount_paise;
    else bars[i].projected += r.amount_paise;
    bars[i].total += r.amount_paise;
  }
  return bars;
}

export type QuarterCell = { recognised: number; projected: number; total: number };
export type QuarterTable = {
  quarters: QuarterCell[]; // Q1..Q4
  fyTotal: QuarterCell;
};

// Recognised / Projected / Total by fiscal quarter, plus the FY total column.
export function quarterTable(rows: ReportRow[], startYear: number): QuarterTable {
  const fyLbl = fyLabelForStartYear(startYear);
  const quarters: QuarterCell[] = [1, 2, 3, 4].map(() => ({
    recognised: 0,
    projected: 0,
    total: 0,
  }));
  const fyTotal: QuarterCell = { recognised: 0, projected: 0, total: 0 };
  for (const r of rows) {
    const month = ym(r.period_month);
    if (fyLabelForMonth(month) !== fyLbl) continue;
    const q = fyQuarter(month) - 1;
    const cell = quarters[q];
    if (r.recognition_status === "recognised") {
      cell.recognised += r.amount_paise;
      fyTotal.recognised += r.amount_paise;
    } else {
      cell.projected += r.amount_paise;
      fyTotal.projected += r.amount_paise;
    }
    cell.total += r.amount_paise;
    fyTotal.total += r.amount_paise;
  }
  return { quarters, fyTotal };
}

export type RevenueKpis = {
  arrPaise: number; // ARR = every component that falls in the FY (owner rule)
  recognisedPaise: number; // recognised portion of the FY
  projectedPaise: number; // projected (not-yet-delivered) portion of the FY
  monthTotalPaise: number; // total revenue in the current month, all components
  recognisedShare: number; // recognised ÷ ARR, 0..1 (0 when empty)
};

// Headline numbers for the metric cards + dashboard strip. `currentMonth` is
// "YYYY-MM". ARR is the whole-FY total (all components); the month figure is the
// total revenue landing in the current month (all components) — neither uses the
// is_recurring flag, per the owner's ARR definition (see file header).
export function revenueKpis(
  rows: ReportRow[],
  startYear: number,
  currentMonth: string,
): RevenueKpis {
  const fyLbl = fyLabelForStartYear(startYear);
  let arr = 0;
  let recognised = 0;
  let projected = 0;
  let monthTotal = 0;
  for (const r of rows) {
    const month = ym(r.period_month);
    if (fyLabelForMonth(month) === fyLbl) {
      arr += r.amount_paise;
      if (r.recognition_status === "recognised") recognised += r.amount_paise;
      else projected += r.amount_paise;
    }
    // The current-month figure is every component landing in that month,
    // independent of the FY filter.
    if (month === currentMonth) monthTotal += r.amount_paise;
  }
  return {
    arrPaise: arr,
    recognisedPaise: recognised,
    projectedPaise: projected,
    monthTotalPaise: monthTotal,
    recognisedShare: arr > 0 ? recognised / arr : 0,
  };
}
