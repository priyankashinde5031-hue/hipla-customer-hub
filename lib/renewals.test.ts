import { describe, it, expect } from "vitest";
import {
  generateRenewalSchedule,
  addMonths,
  renewalDate,
  deviationPercent,
  renewalExpectedPaise,
  planRenewalSync,
  RENEWAL_LOGIC,
  type DesiredRenewal,
  type ExistingRenewal,
} from "./renewals";

describe("generateRenewalSchedule", () => {
  it("yearly term → Year 2,3,4,5", () => {
    const cycles = generateRenewalSchedule(12);
    expect(cycles.map((c) => c.yearNumber)).toEqual([2, 3, 4, 5]);
    expect(cycles.map((c) => c.offsetMonths)).toEqual([12, 24, 36, 48]);
    expect(cycles.every((c) => c.termMonths === 12)).toBe(true);
  });

  it("3-year initial term → only Year 4,5", () => {
    const cycles = generateRenewalSchedule(36);
    expect(cycles.map((c) => c.yearNumber)).toEqual([4, 5]);
    expect(cycles.map((c) => c.offsetMonths)).toEqual([36, 48]);
  });

  it("2-year initial term → Year 3,4,5", () => {
    const cycles = generateRenewalSchedule(24);
    expect(cycles.map((c) => c.yearNumber)).toEqual([3, 4, 5]);
  });

  it("5-year term → no renewals inside a 5-year horizon", () => {
    expect(generateRenewalSchedule(60)).toEqual([]);
  });

  it("defaults a missing/invalid term to yearly", () => {
    expect(generateRenewalSchedule(0).map((c) => c.yearNumber)).toEqual([2, 3, 4, 5]);
    expect(generateRenewalSchedule(NaN).map((c) => c.yearNumber)).toEqual([2, 3, 4, 5]);
  });

  it("honours a custom horizon", () => {
    expect(generateRenewalSchedule(12, 3).map((c) => c.yearNumber)).toEqual([2, 3]);
  });
});

describe("addMonths", () => {
  it("adds whole years", () => {
    expect(addMonths("2026-01-01", 12)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", 48)).toBe("2030-01-01");
  });

  it("clamps to the last valid day of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29"); // leap year
  });

  it("returns null for missing or malformed dates", () => {
    expect(addMonths(null, 12)).toBeNull();
    expect(addMonths("not-a-date", 12)).toBeNull();
  });
});

describe("renewalDate", () => {
  it("computes go-live + offset", () => {
    expect(renewalDate("2026-01-01", 36)).toBe("2029-01-01");
  });
  it("is null when go-live is unset", () => {
    expect(renewalDate(null, 12)).toBeNull();
  });
});

describe("renewalExpectedPaise", () => {
  const escLine = {
    basePaise: 100_00,
    logic: RENEWAL_LOGIC.escalation,
    escalationPct: 12,
    amcPct: null,
  };

  it("returns the flat base in Year 1 for an escalating line (no years elapsed)", () => {
    expect(renewalExpectedPaise([escLine], 1)).toBe(100_00);
  });

  it("compounds escalation once per contract year elapsed", () => {
    expect(renewalExpectedPaise([escLine], 2)).toBe(112_00); // ×1.12
    expect(renewalExpectedPaise([escLine], 3)).toBe(Math.round(100_00 * 1.12 ** 2)); // 125_44
    expect(renewalExpectedPaise([escLine], 4)).toBe(Math.round(100_00 * 1.12 ** 3));
  });

  it("charges AMC as a flat % of the line total, unchanged every year", () => {
    const amcLine = { basePaise: 100_00, logic: RENEWAL_LOGIC.amc, escalationPct: null, amcPct: 15 };
    expect(renewalExpectedPaise([amcLine], 2)).toBe(15_00);
    expect(renewalExpectedPaise([amcLine], 5)).toBe(15_00); // does not compound
  });

  it("contributes 0 for a one-time line", () => {
    const oneTime = {
      basePaise: 500_00,
      logic: RENEWAL_LOGIC.oneTime,
      escalationPct: null,
      amcPct: null,
    };
    expect(renewalExpectedPaise([oneTime], 2)).toBe(0);
  });

  it("repeats the base for a flat line or a line with no term", () => {
    const flat = { basePaise: 500_00, logic: RENEWAL_LOGIC.flat, escalationPct: null, amcPct: null };
    const noTerm = { basePaise: 500_00, logic: null, escalationPct: null, amcPct: null };
    expect(renewalExpectedPaise([flat], 4)).toBe(500_00);
    expect(renewalExpectedPaise([noTerm], 4)).toBe(500_00);
  });

  it("mixes logics on one PO, summing each line's own basis", () => {
    const mixed = [
      { basePaise: 100_00, logic: RENEWAL_LOGIC.escalation, escalationPct: 12, amcPct: null }, // → 112_00
      { basePaise: 200_00, logic: RENEWAL_LOGIC.amc, escalationPct: null, amcPct: 10 }, // → 20_00
      { basePaise: 300_00, logic: RENEWAL_LOGIC.oneTime, escalationPct: null, amcPct: null }, // → 0
    ];
    expect(renewalExpectedPaise(mixed, 2)).toBe(112_00 + 20_00 + 0);
  });

  it("is 0 for no lines", () => {
    expect(renewalExpectedPaise([], 3)).toBe(0);
  });

  describe("by category basis (After N Years terms)", () => {
    const byCat = (categoryName: string | null, base = 100_00) => ({
      basePaise: base,
      logic: RENEWAL_LOGIC.byCategory,
      escalationPct: 25,
      amcPct: 18,
      categoryName,
    });

    it("escalates software/opex lines by a flat 25% over base, same every year", () => {
      expect(renewalExpectedPaise([byCat("Software")], 4)).toBe(125_00);
      expect(renewalExpectedPaise([byCat("Software")], 5)).toBe(125_00); // held flat
      expect(renewalExpectedPaise([byCat("Opex (Hardware + Software)")], 4)).toBe(125_00);
      expect(renewalExpectedPaise([byCat("Opex (Hardware + Software)")], 5)).toBe(125_00);
    });

    it("takes a flat 18% AMC for every other category", () => {
      expect(renewalExpectedPaise([byCat("Hardware")], 4)).toBe(18_00);
      expect(renewalExpectedPaise([byCat("Hardware")], 5)).toBe(18_00);
      expect(renewalExpectedPaise([byCat("Installation")], 4)).toBe(18_00);
      expect(renewalExpectedPaise([byCat(null)], 4)).toBe(18_00); // no category → AMC branch
    });

    it("falls back to 25/18 defaults when the term leaves the percentages blank", () => {
      const soft = { basePaise: 100_00, logic: RENEWAL_LOGIC.byCategory, escalationPct: null, amcPct: null, categoryName: "Software" };
      const hard = { basePaise: 100_00, logic: RENEWAL_LOGIC.byCategory, escalationPct: null, amcPct: null, categoryName: "Hardware" };
      expect(renewalExpectedPaise([soft], 4)).toBe(125_00);
      expect(renewalExpectedPaise([hard], 4)).toBe(18_00);
    });

    it("is worth more than ₹0 so the year is actually generated (regression: HIPLA-PO-0192)", () => {
      // 4 × ₹68,000 Meeting Room Scheduler, Hardware → 18% AMC = ₹48,960/yr.
      expect(renewalExpectedPaise([byCat("Hardware", 272_000_00)], 4)).toBe(48_960_00);
    });
  });
});

describe("planRenewalSync", () => {
  const desired = (yearNumber: number, expectedPaise = 100_00): DesiredRenewal => ({
    yearNumber,
    offsetMonths: (yearNumber - 1) * 12,
    termMonths: 12,
    expectedPaise,
  });
  const existing = (
    id: string,
    yearNumber: number,
    over: Partial<ExistingRenewal> = {},
  ): ExistingRenewal => ({
    id,
    yearNumber,
    status: "upcoming",
    hasInvoices: false,
    hasAttachment: false,
    ...over,
  });

  it("inserts every projected year on a fresh PO (no existing rows)", () => {
    const plan = planRenewalSync([desired(2), desired(3), desired(4), desired(5)], []);
    expect(plan.toInsert.map((d) => d.yearNumber)).toEqual([2, 3, 4, 5]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
  });

  it("generates nothing when the PO projects no ₹>0 years (one-time hardware)", () => {
    // Caller filters expected>0, so an all-one-time PO passes an empty desired.
    const plan = planRenewalSync([], []);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
  });

  it("removes pristine upcoming rows once their year drops to ₹0", () => {
    // PO edited so Year 4 & 5 are no longer projected (e.g. lines went one-time).
    const rows = [existing("a", 2), existing("b", 3), existing("c", 4), existing("d", 5)];
    const plan = planRenewalSync([desired(2), desired(3)], rows);
    expect(plan.toDeleteIds.sort()).toEqual(["c", "d"]);
    expect(plan.toUpdate.map((u) => u.id).sort()).toEqual(["a", "b"]);
    expect(plan.toInsert).toEqual([]);
  });

  it("recalculates the expected value of pristine upcoming rows on a PO edit", () => {
    const plan = planRenewalSync([desired(2, 250_00)], [existing("a", 2)]);
    expect(plan.toUpdate).toEqual([
      { id: "a", expectedPaise: 250_00, offsetMonths: 12, termMonths: 12 },
    ]);
  });

  it("adds a year that a PO edit newly pushes above ₹0", () => {
    // Was a 1-line one-time PO (no rows); edit adds a recurring line → Year 2-5.
    const plan = planRenewalSync(
      [desired(2), desired(3), desired(4), desired(5)],
      [existing("a", 2)],
    );
    expect(plan.toInsert.map((d) => d.yearNumber)).toEqual([3, 4, 5]);
    expect(plan.toUpdate.map((u) => u.id)).toEqual(["a"]);
  });

  it("never rewrites a renewed year (history is protected)", () => {
    const rows = [existing("a", 2, { status: "renewed" }), existing("b", 3)];
    const plan = planRenewalSync([desired(2, 999_00), desired(3)], rows);
    expect(plan.toUpdate.map((u) => u.id)).toEqual(["b"]); // "a" left alone
    expect(plan.toDeleteIds).toEqual([]);
  });

  it("never deletes a renewed year even when it drops to ₹0", () => {
    const rows = [existing("a", 4, { status: "renewed" })];
    const plan = planRenewalSync([], rows); // Year 4 no longer projected
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
  });

  it("protects rows with invoices or an attached PO file from update and delete", () => {
    const rows = [
      existing("a", 2, { hasInvoices: true }),
      existing("b", 3, { hasAttachment: true }),
    ];
    const plan = planRenewalSync([desired(2, 500_00)], rows); // Year 3 no longer projected
    expect(plan.toUpdate).toEqual([]); // "a" protected by invoices
    expect(plan.toDeleteIds).toEqual([]); // "b" protected by attachment
  });
});

describe("deviationPercent", () => {
  it("computes ((actual − expected) / expected) × 100", () => {
    expect(deviationPercent(110_00, 100_00)).toBeCloseTo(10);
    expect(deviationPercent(90_00, 100_00)).toBeCloseTo(-10);
  });
  it("is 0% when expected is 0, null, or missing", () => {
    expect(deviationPercent(100_00, 0)).toBe(0);
    expect(deviationPercent(100_00, null)).toBe(0);
    expect(deviationPercent(100_00, undefined)).toBe(0);
  });
  it("is 0% when actual is missing", () => {
    expect(deviationPercent(null, 100_00)).toBe(0);
  });
});
