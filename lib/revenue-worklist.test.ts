import { describe, it, expect } from "vitest";
import { classifyLineItem, isRenewalOverdue } from "./revenue-worklist";

const base = {
  recognitionMethod: "saas" as string | null,
  coverageMonths: 12,
  revenueExcluded: false,
  hasGoLive: true,
  hasExpected: false,
  contractTermMonths: 12 as number | null,
};

describe("classifyLineItem", () => {
  it("excluded lines are never at risk", () => {
    expect(classifyLineItem({ ...base, revenueExcluded: true, recognitionMethod: null, hasGoLive: false, hasExpected: false })).toBeNull();
  });
  it("no anchor is the blocking reason", () => {
    expect(classifyLineItem({ ...base, hasGoLive: false, hasExpected: false, recognitionMethod: null })).toBe("no_anchor");
  });
  it("expected delivery alone is a valid anchor", () => {
    expect(classifyLineItem({ ...base, hasGoLive: false, hasExpected: true })).toBeNull();
  });
  it("anchored but no method", () => {
    expect(classifyLineItem({ ...base, recognitionMethod: null })).toBe("no_method");
  });
  it("multi-year term with default coverage flags a review", () => {
    expect(classifyLineItem({ ...base, contractTermMonths: 36, coverageMonths: 12 })).toBe("coverage_review");
  });
  it("multi-year term with proper coverage is fine", () => {
    expect(classifyLineItem({ ...base, contractTermMonths: 36, coverageMonths: 36 })).toBeNull();
  });
  it("standard anchored + method + 12mo term is fine", () => {
    expect(classifyLineItem(base)).toBeNull();
  });
});

describe("isRenewalOverdue", () => {
  it("done renewals are never overdue", () => {
    expect(isRenewalOverdue("2024-01", "renewed", "2026-08")).toBe(false);
  });
  it("no start date → not listed here", () => {
    expect(isRenewalOverdue(null, "upcoming", "2026-08")).toBe(false);
  });
  it("past start, not done → overdue", () => {
    expect(isRenewalOverdue("2026-05", "upcoming", "2026-08")).toBe(true);
  });
  it("future start → not overdue", () => {
    expect(isRenewalOverdue("2027-01", "upcoming", "2026-08")).toBe(false);
  });
});
