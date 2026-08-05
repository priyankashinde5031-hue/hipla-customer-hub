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
// Status — EVENT-DRIVEN (owner rule): delivered → recognised (every month),
// not delivered → projected. No dependency on today's date.
// ---------------------------------------------------------------------------

describe("assignStatus", () => {
  it("delivered -> recognised", () => {
    expect(assignStatus(true)).toBe("recognised");
  });
  it("not delivered -> projected", () => {
    expect(assignStatus(false)).toBe("projected");
  });
});

// ---------------------------------------------------------------------------
// shapeScheduleRows — calendar + status wrapping the pure generator
// ---------------------------------------------------------------------------

describe("shapeScheduleRows: basic SaaS", () => {
  const rows = shapeScheduleRows({ ...base, anchorMonth: "2026-06" });
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

describe("delivery drives status (owner rule)", () => {
  it("not delivered (expected-delivery anchor) -> every month projected", () => {
    const rows = shapeScheduleRows({
      ...base,
      anchorSource: "expected_delivery",
      delivered: false,
    });
    expect(rows.every((r) => r.recognition_status === "projected")).toBe(true);
  });

  it("delivered -> EVERY month recognised, including future ones", () => {
    // A live order (or done renewal) anchored far in the future is still fully
    // recognised — recognition follows the event, not the calendar.
    const rows = shapeScheduleRows({
      ...base,
      anchorMonth: "2030-01",
      delivered: true,
    });
    expect(rows.every((r) => r.recognition_status === "recognised")).toBe(true);
  });
});

// Renewal marked done → the whole cycle is recognised, past AND future.
describe("done renewal is fully recognised", () => {
  const rows = shapeScheduleRows({
    valuePaise: P(120_000),
    method: "saas",
    anchorMonth: "2025-01",
    coverageMonths: 12,
    anchorSource: "actual_go_live",
    delivered: true, // renewal marked done
  });
  it("all 12 months recognised regardless of month", () => {
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.recognition_status === "recognised")).toBe(true);
  });
});

// Re-anchor: an expected-delivery schedule is projected; once the actual go-live
// lands, the whole thing (every month) becomes recognised.
describe("re-anchor from expected to actual", () => {
  const projected = shapeScheduleRows({
    ...base,
    anchorMonth: "2025-09",
    anchorSource: "expected_delivery",
    delivered: false,
  });
  const reanchored = shapeScheduleRows({
    ...base,
    anchorMonth: "2025-06",
    anchorSource: "actual_go_live",
    delivered: true,
  });
  it("months shift to the actual anchor", () => {
    expect(projected[0].period_month).toBe("2025-09-01");
    expect(reanchored[0].period_month).toBe("2025-06-01");
  });
  it("expected → all projected; actual go-live → all recognised", () => {
    expect(projected.every((r) => r.recognition_status === "projected")).toBe(true);
    expect(reanchored.every((r) => r.recognition_status === "recognised")).toBe(true);
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
  });
  const cancelled = shapeScheduleRows({
    valuePaise: P(144_000),
    method: "opex",
    anchorMonth: "2024-11",
    coverageMonths: 12,
    anchorSource: "actual_go_live",
    delivered: true,
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
