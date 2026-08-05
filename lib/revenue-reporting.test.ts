import { describe, it, expect } from "vitest";
import {
  fyStartYearOf,
  fyLabelForStartYear,
  fyMonths,
  monthlyBars,
  quarterTable,
  revenueKpis,
  type ReportRow,
} from "./revenue-reporting";

const P = (rupees: number) => rupees * 100;
const row = (
  month: string,
  amount: number,
  status: "recognised" | "projected",
  recurring = true,
): ReportRow => ({
  period_month: `${month}-01`,
  amount_paise: amount,
  is_recurring: recurring,
  recognition_status: status,
});

describe("FY helpers", () => {
  it("maps months to the right FY start year", () => {
    expect(fyStartYearOf("2026-04")).toBe(2026);
    expect(fyStartYearOf("2026-12")).toBe(2026);
    expect(fyStartYearOf("2027-03")).toBe(2026);
    expect(fyStartYearOf("2027-04")).toBe(2027);
  });
  it("labels and enumerates FY months Apr→Mar", () => {
    expect(fyLabelForStartYear(2026)).toBe("FY 2026–27");
    const months = fyMonths(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-04");
    expect(months[11]).toBe("2027-03");
  });
});

describe("monthlyBars", () => {
  const rows = [
    row("2026-04", P(10_000), "recognised"),
    row("2026-04", P(5_000), "projected"),
    row("2027-03", P(20_000), "projected"),
    row("2025-03", P(99_999), "recognised"), // outside FY 2026-27 → ignored
  ];
  const bars = monthlyBars(rows, 2026);
  it("has 12 bars Apr→Mar and buckets by status", () => {
    expect(bars).toHaveLength(12);
    expect(bars[0]).toEqual({ month: "2026-04", recognised: P(10_000), projected: P(5_000), total: P(15_000) });
    expect(bars[11]).toEqual({ month: "2027-03", recognised: 0, projected: P(20_000), total: P(20_000) });
  });
  it("ignores rows outside the FY", () => {
    const total = bars.reduce((t, b) => t + b.total, 0);
    expect(total).toBe(P(35_000));
  });
});

describe("quarterTable", () => {
  const rows = [
    row("2026-04", P(10_000), "recognised"), // Q1
    row("2026-08", P(6_000), "projected"), // Q2
    row("2026-11", P(3_000), "recognised"), // Q3
    row("2027-02", P(1_000), "projected"), // Q4
  ];
  const t = quarterTable(rows, 2026);
  it("buckets into the right quarters", () => {
    expect(t.quarters[0].recognised).toBe(P(10_000));
    expect(t.quarters[1].projected).toBe(P(6_000));
    expect(t.quarters[2].recognised).toBe(P(3_000));
    expect(t.quarters[3].projected).toBe(P(1_000));
  });
  it("fy total sums all quarters", () => {
    expect(t.fyTotal.total).toBe(P(20_000));
    expect(t.fyTotal.recognised).toBe(P(13_000));
    expect(t.fyTotal.projected).toBe(P(7_000));
  });
});

describe("revenueKpis — ARR is the FY total of ALL components (owner rule)", () => {
  const rows = [
    row("2026-08", P(1_00_000), "recognised", true), // recurring, current month
    row("2026-08", P(28_80_000), "recognised", false), // capex upfront, current month — MUST count in ARR
    row("2026-09", P(1_00_000), "projected", true),
  ];
  const k = revenueKpis(rows, 2026, "2026-08");
  it("ARR counts every component in the FY, capex upfront included", () => {
    expect(k.arrPaise).toBe(P(1_00_000) + P(28_80_000) + P(1_00_000));
  });
  it("current-month figure is the TOTAL of all components that month (incl. the capex lump)", () => {
    expect(k.monthTotalPaise).toBe(P(1_00_000) + P(28_80_000));
  });
  it("recognised share is recognised ÷ ARR", () => {
    // recognised = 1L + 28.8L = 29.8L; ARR = 30.8L
    expect(k.recognisedShare).toBeCloseTo((2980000) / (3080000), 5);
  });
  it("empty rows give a zero share, not NaN", () => {
    expect(revenueKpis([], 2026, "2026-08").recognisedShare).toBe(0);
  });
});

describe("revenueKpis — the worked Capex example (owner, 2026-08-05)", () => {
  // ₹10L Capex, go-live Aug-2026: ₹8L upfront (Aug) + ₹16,667 tail Aug→Jul.
  // FY 2026-27 (Apr-26→Mar-27) should capture ₹8L + 8 tail months = ₹9,33,333.
  const tail = Math.floor(P(2_00_000) / 12); // 16,666 (paise floor)
  const rows = [
    row("2026-08", P(8_00_000), "recognised", false), // upfront
    ...["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
        "2027-04", "2027-05", "2027-06", "2027-07"].map((m, i) =>
      row(m, i === 0 ? tail + (P(2_00_000) - tail * 12) : tail, "projected", true),
    ),
  ];
  it("FY 2026-27 ARR ≈ ₹8L upfront + 8 tail months", () => {
    const k = revenueKpis(rows, 2026, "2026-08");
    // 8L + 8 tail months (Aug→Mar). First tail month carries the rounding remainder.
    const firstTail = tail + (P(2_00_000) - tail * 12);
    expect(k.arrPaise).toBe(P(8_00_000) + firstTail + tail * 7);
  });
  it("the remaining 4 tail months roll into FY 2027-28", () => {
    const k2728 = revenueKpis(rows, 2027, "2026-08");
    expect(k2728.arrPaise).toBe(tail * 4);
  });
});
