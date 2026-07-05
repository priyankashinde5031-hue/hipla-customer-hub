import { describe, it, expect } from "vitest";
import {
  generateRenewalSchedule,
  addMonths,
  renewalDate,
  deviationPercent,
  escalatedExpectedPaise,
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

describe("escalatedExpectedPaise", () => {
  const lines = [{ basePaise: 100_00, escalationPct: 12 }];

  it("returns the flat base in Year 1 (no years elapsed)", () => {
    expect(escalatedExpectedPaise(lines, 1)).toBe(100_00);
  });

  it("compounds the escalation once per contract year elapsed", () => {
    expect(escalatedExpectedPaise(lines, 2)).toBe(112_00); // ×1.12
    expect(escalatedExpectedPaise(lines, 3)).toBe(Math.round(100_00 * 1.12 ** 2)); // 125_44
    expect(escalatedExpectedPaise(lines, 4)).toBe(Math.round(100_00 * 1.12 ** 3));
  });

  it("keeps lines with no / zero / null escalation flat", () => {
    expect(escalatedExpectedPaise([{ basePaise: 500_00, escalationPct: 0 }], 5)).toBe(500_00);
    expect(escalatedExpectedPaise([{ basePaise: 500_00, escalationPct: null }], 5)).toBe(500_00);
    expect(escalatedExpectedPaise([{ basePaise: 500_00, escalationPct: undefined }], 5)).toBe(500_00);
  });

  it("escalates each line by its own rate, then sums (rounded per line)", () => {
    const mixed = [
      { basePaise: 100_00, escalationPct: 12 }, // → 112_00
      { basePaise: 200_00, escalationPct: null }, // → 200_00 flat
    ];
    expect(escalatedExpectedPaise(mixed, 2)).toBe(112_00 + 200_00);
  });

  it("is 0 for no lines", () => {
    expect(escalatedExpectedPaise([], 3)).toBe(0);
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
