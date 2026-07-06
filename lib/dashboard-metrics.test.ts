import { describe, it, expect } from "vitest";
import {
  diffDays,
  renewalAgingTag,
  invoiceAgingBucket,
  isUsageBelowExpected,
  isProjectAtRisk,
} from "./dashboard-metrics";

describe("diffDays", () => {
  it("counts whole days, signed by direction", () => {
    expect(diffDays("2026-07-05", "2026-07-10")).toBe(5);
    expect(diffDays("2026-07-10", "2026-07-05")).toBe(-5);
    expect(diffDays("2026-07-05", "2026-07-05")).toBe(0);
  });

  it("crosses months and years", () => {
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    expect(diffDays("2026-02-28", "2026-03-01")).toBe(1); // 2026 not a leap year
  });

  it("returns null on missing/bad input", () => {
    expect(diffDays(null, "2026-07-05")).toBeNull();
    expect(diffDays("2026-07-05", "nope")).toBeNull();
  });
});

describe("renewalAgingTag (overdue days → tag)", () => {
  it("buckets at the 30 and 90 day boundaries", () => {
    expect(renewalAgingTag(1)).toBe("0–30d");
    expect(renewalAgingTag(30)).toBe("0–30d");
    expect(renewalAgingTag(31)).toBe("31–90d");
    expect(renewalAgingTag(90)).toBe("31–90d");
    expect(renewalAgingTag(91)).toBe("90d+");
  });
});

describe("invoiceAgingBucket (days overdue → bucket)", () => {
  it("Current when not yet due (≤0)", () => {
    expect(invoiceAgingBucket(0)).toBe("Current");
    expect(invoiceAgingBucket(-5)).toBe("Current");
  });
  it("buckets past-due at 30 and 60 boundaries", () => {
    expect(invoiceAgingBucket(1)).toBe("1–30");
    expect(invoiceAgingBucket(30)).toBe("1–30");
    expect(invoiceAgingBucket(31)).toBe("31–60");
    expect(invoiceAgingBucket(60)).toBe("31–60");
    expect(invoiceAgingBucket(61)).toBe("60+");
  });
});

describe("isUsageBelowExpected (−25% threshold)", () => {
  it("fires only at or beyond 25% below expected", () => {
    expect(isUsageBelowExpected(75, 100)).toBe(true); // exactly −25%
    expect(isUsageBelowExpected(74, 100)).toBe(true); // −26%
    expect(isUsageBelowExpected(80, 100)).toBe(false); // −20%
    expect(isUsageBelowExpected(120, 100)).toBe(false); // above expected
  });
  it("no alert without a real target", () => {
    expect(isUsageBelowExpected(0, 0)).toBe(false);
    expect(isUsageBelowExpected(0, null)).toBe(false);
  });
  it("zero usage against a target is below expected", () => {
    expect(isUsageBelowExpected(0, 50)).toBe(true);
  });
});

describe("isProjectAtRisk (stall 14d or past go-live)", () => {
  const today = "2026-07-05";
  it("not at risk unless in progress", () => {
    expect(
      isProjectAtRisk({ overallStatus: "completed", targetGoLive: "2026-01-01", daysInCurrentStage: 99, today }),
    ).toBe(false);
    expect(
      isProjectAtRisk({ overallStatus: "not_started", targetGoLive: null, daysInCurrentStage: 99, today }),
    ).toBe(false);
  });
  it("at risk when past target go-live", () => {
    expect(
      isProjectAtRisk({ overallStatus: "in_progress", targetGoLive: "2026-07-04", daysInCurrentStage: 1, today }),
    ).toBe(true);
  });
  it("at risk when current stage stalled ≥14 days", () => {
    expect(
      isProjectAtRisk({ overallStatus: "in_progress", targetGoLive: null, daysInCurrentStage: 14, today }),
    ).toBe(true);
    expect(
      isProjectAtRisk({ overallStatus: "in_progress", targetGoLive: null, daysInCurrentStage: 13, today }),
    ).toBe(false);
  });
  it("healthy in-progress project is not at risk", () => {
    expect(
      isProjectAtRisk({ overallStatus: "in_progress", targetGoLive: "2026-12-01", daysInCurrentStage: 3, today }),
    ).toBe(false);
  });
});
