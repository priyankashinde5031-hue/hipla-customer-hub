import { describe, it, expect } from "vitest";
import {
  generateRenewalSchedule,
  addMonths,
  renewalDate,
  deviationPercent,
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
