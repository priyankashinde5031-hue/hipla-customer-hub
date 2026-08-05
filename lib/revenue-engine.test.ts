import { describe, it, expect } from "vitest";
import {
  generateSchedule,
  summarizeSchedule,
  addYearMonths,
  toYearMonth,
  isRecurringComponent,
  type ScheduleRow,
  type RevenueComponent,
} from "./revenue-engine";

// Helpers ------------------------------------------------------------------

const sum = (rows: ScheduleRow[]) => rows.reduce((t, r) => t + r.amount, 0);
const monthsOf = (rows: ScheduleRow[]) => rows.map((r) => r.month);
const byComponent = (rows: ScheduleRow[], c: RevenueComponent) =>
  rows.filter((r) => r.component === c);

// Rupees -> paise, for readability against the spec's rupee figures.
const P = (rupees: number) => rupees * 100;

// ---------------------------------------------------------------------------
// Month arithmetic
// ---------------------------------------------------------------------------

describe("month helpers", () => {
  it("toYearMonth accepts YYYY-MM and YYYY-MM-DD, rejects junk", () => {
    expect(toYearMonth("2025-05")).toBe("2025-05");
    expect(toYearMonth("2025-05-02")).toBe("2025-05");
    expect(toYearMonth("2025-05-28")).toBe("2025-05"); // no day-level proration
    expect(toYearMonth("2025-13")).toBeNull();
    expect(toYearMonth("nonsense")).toBeNull();
    expect(toYearMonth(null)).toBeNull();
  });

  it("addYearMonths rolls across year boundaries", () => {
    expect(addYearMonths("2025-05", 11)).toBe("2026-04");
    expect(addYearMonths("2025-06", 35)).toBe("2028-05");
    expect(addYearMonths("2024-11", 11)).toBe("2025-10");
  });
});

// ---------------------------------------------------------------------------
// The six worked examples (spec §3) — exact per-month amounts
// ---------------------------------------------------------------------------

describe("worked example: Capex ₹10,00,000, May-2025, coverage 12", () => {
  const rows = generateSchedule(P(1_000_000), "capex", "2025-05", 12);

  it("sums to exactly the line item value", () => {
    expect(sum(rows)).toBe(P(1_000_000));
  });

  it("80% upfront in the anchor month", () => {
    const upfront = byComponent(rows, "capex_upfront");
    expect(upfront).toHaveLength(1);
    expect(upfront[0].month).toBe("2025-05");
    expect(upfront[0].amount).toBe(P(800_000));
  });

  it("20% tail over 12 months beginning in the anchor month", () => {
    const tail = byComponent(rows, "capex_tail");
    expect(tail).toHaveLength(12);
    expect(tail[0].month).toBe("2025-05");
    expect(tail[11].month).toBe("2026-04");
    // Floor each instalment (₹16,666.66), remainder of 8 paise on the first
    // month so the tail sums to exactly ₹2,00,000.
    expect(tail[0].amount).toBe(1_666_674);
    expect(tail.slice(1).every((r) => r.amount === 1_666_666)).toBe(true);
    expect(sum(tail)).toBe(P(200_000));
  });
});

describe("worked example: Opex ₹1,44,000, Nov-2024, coverage 12", () => {
  const rows = generateSchedule(P(144_000), "opex", "2024-11", 12);
  it("₹12,000/month, Nov-2024 → Oct-2025", () => {
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.component === "opex")).toBe(true);
    expect(rows.every((r) => r.amount === P(12_000))).toBe(true);
    expect(rows[0].month).toBe("2024-11");
    expect(rows[11].month).toBe("2025-10");
    expect(sum(rows)).toBe(P(144_000));
  });
});

describe("worked example: SaaS ₹1,20,000, Jun-2026, coverage 12", () => {
  const rows = generateSchedule(P(120_000), "saas", "2026-06", 12);
  it("₹10,000/month, Jun-2026 → May-2027", () => {
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.component === "saas")).toBe(true);
    expect(rows.every((r) => r.amount === P(10_000))).toBe(true);
    expect(rows[0].month).toBe("2026-06");
    expect(rows[11].month).toBe("2027-05");
    expect(sum(rows)).toBe(P(120_000));
  });
});

describe("worked example: One-Time ₹10,000, Jan-2025", () => {
  const rows = generateSchedule(P(10_000), "one_time", "2025-01", 12);
  it("₹10,000 in Jan-2025, nothing else (coverage ignored)", () => {
    expect(rows).toEqual([
      { month: "2025-01", component: "one_time", amount: P(10_000) },
    ]);
  });
});

describe("worked example: Capex multi-year ₹36,00,000, Jun-2025, coverage 36", () => {
  const rows = generateSchedule(P(3_600_000), "capex", "2025-06", 36);
  it("₹28,80,000 upfront, then ₹20,000/mo → May-2028", () => {
    const upfront = byComponent(rows, "capex_upfront");
    expect(upfront[0].amount).toBe(P(2_880_000));
    expect(upfront[0].month).toBe("2025-06");
    const tail = byComponent(rows, "capex_tail");
    expect(tail).toHaveLength(36);
    expect(tail.every((r) => r.amount === P(20_000))).toBe(true);
    expect(tail[35].month).toBe("2028-05");
    expect(sum(rows)).toBe(P(3_600_000));
  });
});

describe("worked example: Opex multi-year ₹36,00,000, Jun-2025, coverage 36", () => {
  const rows = generateSchedule(P(3_600_000), "opex", "2025-06", 36);
  it("₹1,00,000/month, Jun-2025 → May-2028", () => {
    expect(rows).toHaveLength(36);
    expect(rows.every((r) => r.amount === P(100_000))).toBe(true);
    expect(rows[0].month).toBe("2025-06");
    expect(rows[35].month).toBe("2028-05");
    expect(sum(rows)).toBe(P(3_600_000));
  });
});

// ---------------------------------------------------------------------------
// Rounding — a value not divisible by the divisor sums back exactly (spec §3, §12)
// ---------------------------------------------------------------------------

describe("rounding: ₹1,00,000 / 12 sums back to the original exactly", () => {
  it("floors each instalment, remainder on the first month", () => {
    const rows = generateSchedule(P(100_000), "opex", "2025-04", 12);
    // 10,000,000 paise / 12 = 833,333.33 -> floor 833,333, remainder 4 paise.
    expect(rows[0].amount).toBe(833_337);
    expect(rows.slice(1).every((r) => r.amount === 833_333)).toBe(true);
    expect(sum(rows)).toBe(P(100_000));
  });

  it("holds for saas and capex tail too", () => {
    const saas = generateSchedule(P(100_000), "saas", "2025-04", 12);
    expect(sum(saas)).toBe(P(100_000));
    const capex = generateSchedule(P(100_000), "capex", "2025-04", 12);
    expect(sum(capex)).toBe(P(100_000));
  });
});

// ---------------------------------------------------------------------------
// coverage_months as a universal divisor: 9 (scope change), 36 / 60 (multi-year)
// across all four methods (spec §12)
// ---------------------------------------------------------------------------

describe("coverage_months across methods", () => {
  it("scope change: Opex ₹60,000, Feb-2025, coverage 9 → Feb-25 → Oct-25", () => {
    const rows = generateSchedule(P(60_000), "opex", "2025-02", 9);
    expect(rows).toHaveLength(9);
    expect(rows[0].month).toBe("2025-02");
    expect(rows[8].month).toBe("2025-10");
    // 6,000,000 / 9 = 666,666.67 -> floor 666,666, remainder 6 paise.
    expect(rows[0].amount).toBe(666_672);
    expect(rows.slice(1).every((r) => r.amount === 666_666)).toBe(true);
    expect(sum(rows)).toBe(P(60_000));
  });

  it.each([9, 12, 36, 60])("every method sums exactly at coverage %i", (cov) => {
    for (const method of ["saas", "opex", "capex"] as const) {
      const rows = generateSchedule(P(137_531), method, "2025-06", cov);
      expect(sum(rows)).toBe(P(137_531));
    }
    // one_time ignores coverage: always a single full row.
    const ot = generateSchedule(P(137_531), "one_time", "2025-06", cov);
    expect(ot).toHaveLength(1);
    expect(ot[0].amount).toBe(P(137_531));
  });

  it("60-month coverage spans exactly five years of months", () => {
    const rows = generateSchedule(P(6_000_000), "saas", "2025-06", 60);
    expect(rows).toHaveLength(60);
    expect(rows[0].month).toBe("2025-06");
    expect(rows[59].month).toBe("2030-05");
  });
});

// ---------------------------------------------------------------------------
// FY boundary crossing (spec §12) — Indian FY runs Apr–Mar. An anchor in Feb
// produces rows in the following FY.
// ---------------------------------------------------------------------------

describe("FY boundary crossing", () => {
  it("a Feb anchor spills into the next FY", () => {
    const rows = generateSchedule(P(120_000), "saas", "2025-02", 12);
    expect(rows[0].month).toBe("2025-02"); // FY 2024-25
    expect(rows[1].month).toBe("2025-03"); // still FY 2024-25 (Mar)
    expect(rows[2].month).toBe("2025-04"); // FY 2025-26 begins
    expect(rows[11].month).toBe("2026-01"); // FY 2025-26
  });
});

// ---------------------------------------------------------------------------
// Recurring vs non-recurring components (spec §7, §10)
// ---------------------------------------------------------------------------

describe("recurring components", () => {
  it("saas / capex_tail / opex are recurring; capex_upfront / one_time are not", () => {
    expect(isRecurringComponent("saas")).toBe(true);
    expect(isRecurringComponent("capex_tail")).toBe(true);
    expect(isRecurringComponent("opex")).toBe(true);
    expect(isRecurringComponent("capex_upfront")).toBe(false);
    expect(isRecurringComponent("one_time")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Summary string is built from the same numbers (spec §8)
// ---------------------------------------------------------------------------

describe("summarizeSchedule", () => {
  it("Capex", () => {
    expect(summarizeSchedule(P(1_000_000), "capex", "2025-05", 12)).toBe(
      "₹10,00,000 · Capex · ₹8,00,000 in May-25, then ₹16,667/mo → Apr-26",
    );
  });
  it("Opex", () => {
    expect(summarizeSchedule(P(144_000), "opex", "2024-11", 12)).toBe(
      "₹1,44,000 · Opex · ₹12,000/mo · Nov-24 → Oct-25",
    );
  });
  it("SaaS", () => {
    expect(summarizeSchedule(P(120_000), "saas", "2026-06", 12)).toBe(
      "₹1,20,000 · SaaS · ₹10,000/mo · Jun-26 → May-27",
    );
  });
  it("One-Time", () => {
    expect(summarizeSchedule(P(10_000), "one_time", "2025-01", 12)).toBe(
      "₹10,000 · One-Time · ₹10,000 in Jan-25",
    );
  });
  it("Capex multi-year", () => {
    expect(summarizeSchedule(P(3_600_000), "capex", "2025-06", 36)).toBe(
      "₹36,00,000 · Capex · ₹28,80,000 in Jun-25, then ₹20,000/mo → May-28",
    );
  });
  it("scope change (Opex, coverage 9)", () => {
    expect(summarizeSchedule(P(60_000), "opex", "2025-02", 9)).toBe(
      "₹60,000 · Opex · ₹6,667/mo · Feb-25 → Oct-25",
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotency of the pure function (spec §12) — same inputs, identical rows.
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("regenerating produces identical rows", () => {
    const a = generateSchedule(P(137_531), "capex", "2025-06", 12);
    const b = generateSchedule(P(137_531), "capex", "2025-06", 12);
    expect(a).toEqual(b);
  });
});
