import { describe, it, expect } from "vitest";
import { usageCategory, usageCategoryTone } from "./usage";

describe("usageCategory", () => {
  it("returns Unknown when no target is set", () => {
    expect(usageCategory(10, 0)).toBe("Unknown");
    expect(usageCategory(0, 0)).toBe("Unknown");
    expect(usageCategory(5, -1)).toBe("Unknown");
  });

  it("returns No Usage when actual is zero (with a target)", () => {
    expect(usageCategory(0, 40)).toBe("No Usage");
  });

  it("returns Low below half of expected", () => {
    expect(usageCategory(19, 40)).toBe("Low"); // 0.475
    expect(usageCategory(1, 40)).toBe("Low");
  });

  it("treats exactly half of expected as Healthy (boundary)", () => {
    expect(usageCategory(20, 40)).toBe("Healthy"); // ratio 0.5
  });

  it("returns Healthy between half and 1.5x", () => {
    expect(usageCategory(40, 40)).toBe("Healthy"); // ratio 1.0
    expect(usageCategory(59, 40)).toBe("Healthy"); // 1.475
  });

  it("treats exactly 1.5x as Heavy (boundary)", () => {
    expect(usageCategory(60, 40)).toBe("Heavy"); // ratio 1.5
  });

  it("returns Heavy well above expected", () => {
    expect(usageCategory(200, 40)).toBe("Heavy");
  });
});

describe("usageCategoryTone", () => {
  it("maps each category to the right status tone", () => {
    expect(usageCategoryTone("No Usage")).toBe("danger");
    expect(usageCategoryTone("Low")).toBe("warning");
    expect(usageCategoryTone("Healthy")).toBe("live");
    expect(usageCategoryTone("Heavy")).toBe("live");
    expect(usageCategoryTone("Unknown")).toBe("neutral");
  });
});
