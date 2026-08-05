import { describe, it, expect } from "vitest";
import {
  fyLabel,
  fyQuarter,
  assignStatus,
  shapeScheduleRows,
  monthFirstDay,
  type ShapeInput,
} from "./revenue-schedule";

const P = (rupees: number) => rupees * 100;

// A baseline shape input; individual tests override what they exercise.
const base: ShapeInput = {
  valuePaise: P(120_000),
  method: "saas",
  anchorMonth: "2025-06",
  coverageMonths: 12,
  anchorSource: "actual_go_live",
  delivered: true,
  currentMonth: "2099-01", // far future -> everything elapsed unless overridden
};

// ---------------------------------------------------------------------------
// Financial year (spec §1) — Apr–Mar, "FY 2026–27"
// ---------------------------------------------------------------------------

describe("fyLabel / fyQuarter", () => {
  it("April starts a new FY", () => {
    expect(fyLabel("2026-04")).toBe("FY 2026–27");
    expect(fyLabel("2026-12")).toBe("FY 2026–27");
  });
  it("Jan–Mar belong to the FY that began the previous April", () => {
    expect(fyLabel("2027-03")).toBe("FY 2026–27");
    expect(fyLabel("2027-04")).toBe("FY 2027–28");
  });
  it("quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar", () => {
    expect(fyQuarter("2026-04")).toBe(1);
    expect(fyQuarter("2026-06")).toBe(1);
    expect(fyQuarter("2026-07")).toBe(2);
    expect(fyQuarter("2026-10")).toBe(3);
    expect(fyQuarter("2027-01")).toBe(4);
    expect(fyQuarter("2027-03")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Status (spec §5)
// ---------------------------------------------------------------------------

describe("assignStatus", () => {
  it("not delivered -> always projected", () => {
    expect(assignStatus("2020-01", { delivered: false, currentMonth: "2099-01" })).toBe("projected");
  });
  it("delivered + elapsed -> recognised", () => {
    expect(assignStatus("2025-05", { delivered: true, currentMonth: "2025-08" })).toBe("recognised");
  });
  it("delivered + current month -> still projected until it elapses", () => {
    expect(assignStatus("2025-08", { delivered: true, currentMonth: "2025-08" })).toBe("projected");
  });
  it("delivered + future -> projected", () => {
    expect(assignStatus("2025-12", { delivered: true, currentMonth: "2025-08" })).toBe("projected");
  });
});

// ---------------------------------------------------------------------------
// shapeScheduleRows — calendar + status wrapping the pure generator
// ---------------------------------------------------------------------------

describe("shapeScheduleRows: basic SaaS", () => {
  const rows = shapeScheduleRows({ ...base, anchorMonth: "2026-06", currentMonth: "2099-01" });
  it("period_month is the first of the month, with FY fields", () => {
    expect(rows[0].period_month).toBe("2026-06-01");
    expect(rows[0].fy_label).toBe("FY 2026–27");
    expect(rows[0].fy_quarter).toBe(1);
    expect(rows[0].is_recurring).toBe(true);
    expect(rows[0].anchor_source).toBe("actual_go_live");
  });
  it("sums to the line value", () => {
    expect(rows.reduce((t, r) => t + r.amount_paise, 0)).toBe(P(120_000));
  });
});

describe("not-delivered line item -> every month projected (spec §5)", () => {
  it("expected-delivery anchor is entirely projected", () => {
    const rows = shapeScheduleRows({
      ...base,
      anchorSource: "expected_delivery",
      delivered: false,
      currentMonth: "2099-01",
    });
    expect(rows.every((r) => r.recognition_status === "projected")).toBe(true);
  });
});

// Retroactive renewal (spec §5, §12): marking a renewal done in month 4
// backfills months 1–3 (its elapsed months) as recognised; month 4 onward stays
// projected. Anchor Jan-2025, "now" = Apr-2025 (the 4th month), delivered=true.
describe("retroactive renewal backfill", () => {
  const rows = shapeScheduleRows({
    valuePaise: P(120_000),
    method: "saas",
    anchorMonth: "2025-01",
    coverageMonths: 12,
    anchorSource: "actual_go_live",
    delivered: true,
    currentMonth: "2025-04",
  });
  it("Jan/Feb/Mar recognised, Apr onward projected", () => {
    const status = (ym: string) => rows.find((r) => r.period_month === `${ym}-01`)!.recognition_status;
    expect(status("2025-01")).toBe("recognised");
    expect(status("2025-02")).toBe("recognised");
    expect(status("2025-03")).toBe("recognised");
    expect(status("2025-04")).toBe("projected");
    expect(status("2025-12")).toBe("projected");
  });
});

// Re-anchor (spec §4, §12): setting an actual go-live moves the schedule off the
// expected date and re-labels elapsed months from projected to recognised.
describe("re-anchor from expected to actual", () => {
  const projected = shapeScheduleRows({
    ...base,
    anchorMonth: "2025-09", // expected delivery Sep-2025
    anchorSource: "expected_delivery",
    delivered: false,
    currentMonth: "2026-01",
  });
  const reanchored = shapeScheduleRows({
    ...base,
    anchorMonth: "2025-06", // actual go-live turned out to be Jun-2025
    anchorSource: "actual_go_live",
    delivered: true,
    currentMonth: "2026-01",
  });
  it("months shift to the actual anchor", () => {
    expect(projected[0].period_month).toBe("2025-09-01");
    expect(reanchored[0].period_month).toBe("2025-06-01");
  });
  it("elapsed months flip projected -> recognised", () => {
    expect(projected.every((r) => r.recognition_status === "projected")).toBe(true);
    expect(reanchored.some((r) => r.recognition_status === "recognised")).toBe(true);
    expect(reanchored.find((r) => r.period_month === "2025-06-01")!.recognition_status).toBe("recognised");
  });
});

// Cancellation (spec §6, §12): forward months deleted, prior months byte-identical.
describe("cancellation zeroes forward only", () => {
  const full = shapeScheduleRows({
    valuePaise: P(144_000),
    method: "opex",
    anchorMonth: "2024-11",
    coverageMonths: 12,
    anchorSource: "actual_go_live",
    delivered: true,
    currentMonth: "2099-01",
  });
  const cancelled = shapeScheduleRows({
    valuePaise: P(144_000),
    method: "opex",
    anchorMonth: "2024-11",
    coverageMonths: 12,
    anchorSource: "actual_go_live",
    delivered: true,
    currentMonth: "2099-01",
    cancelledEffectiveMonth: "2025-07", // terminated effective Jul-2025
  });
  it("Nov-24 → Jun-25 survive; Jul-25 onward gone", () => {
    expect(full).toHaveLength(12);
    expect(cancelled).toHaveLength(8); // Nov,Dec,Jan,Feb,Mar,Apr,May,Jun
    expect(cancelled[cancelled.length - 1].period_month).toBe("2025-06-01");
    expect(cancelled.reduce((t, r) => t + r.amount_paise, 0)).toBe(P(96_000));
  });
  it("surviving months are byte-identical to the uncancelled schedule", () => {
    for (let i = 0; i < cancelled.length; i++) {
      expect(cancelled[i]).toEqual(full[i]);
    }
  });
});

// Idempotency (spec §12): same inputs -> identical rows.
describe("determinism", () => {
  it("shaping twice produces identical rows", () => {
    const a = shapeScheduleRows(base);
    const b = shapeScheduleRows(base);
    expect(a).toEqual(b);
  });
});

describe("monthFirstDay", () => {
  it("appends -01", () => {
    expect(monthFirstDay("2026-06")).toBe("2026-06-01");
  });
});
