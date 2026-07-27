import { describe, it, expect } from "vitest";
import {
  monthsBetween,
  contractYearIndex,
  fyStartIso,
  fyBounds,
  trailingMonthEnds,
  poArrPaise,
  arrTotalAsOf,
  arrByCustomerAsOf,
  arrSeries,
  recognizedForMonth,
  recognizedTotalForMonth,
  recognizedSeries,
  retention,
  deltaPct,
  type PoArr,
} from "./arr-metrics";

describe("monthsBetween", () => {
  it("counts whole months, day-aware", () => {
    expect(monthsBetween("2026-01-15", "2026-02-15")).toBe(1);
    expect(monthsBetween("2026-01-15", "2026-02-14")).toBe(0); // day not yet reached
    expect(monthsBetween("2026-01-15", "2027-01-15")).toBe(12);
    expect(monthsBetween("2026-01-15", "2025-12-15")).toBe(-1);
  });
  it("returns null on bad input", () => {
    expect(monthsBetween(null, "2026-01-01")).toBeNull();
    expect(monthsBetween("2026-01-01", "nope")).toBeNull();
  });
});

describe("contractYearIndex", () => {
  it("is 0 in the first year, 1 in the second", () => {
    expect(contractYearIndex("2026-01-01", "2026-06-01")).toBe(0);
    expect(contractYearIndex("2026-01-01", "2026-12-31")).toBe(0);
    expect(contractYearIndex("2026-01-01", "2027-01-01")).toBe(1);
    expect(contractYearIndex("2026-01-01", "2029-02-01")).toBe(3);
  });
  it("is null before go-live or with no go-live", () => {
    expect(contractYearIndex("2026-06-01", "2026-01-01")).toBeNull();
    expect(contractYearIndex(null, "2026-01-01")).toBeNull();
  });
});

describe("financial-year helpers", () => {
  it("anchors the FY on Apr 1", () => {
    expect(fyStartIso("2026-07-27")).toBe("2026-04-01"); // Jul → this FY started Apr 2026
    expect(fyStartIso("2026-02-10")).toBe("2025-04-01"); // Feb → FY started Apr 2025
    expect(fyStartIso("2026-07-27", -1)).toBe("2025-04-01");
  });
  it("bounds this and last FY", () => {
    expect(fyBounds("2026-07-27", "this")).toEqual({ start: "2026-04-01", end: "2027-04-01" });
    expect(fyBounds("2026-07-27", "last")).toEqual({ start: "2025-04-01", end: "2026-04-01" });
  });
});

describe("trailingMonthEnds", () => {
  it("returns n month-ends oldest→newest ending on the current month", () => {
    const ends = trailingMonthEnds("2026-07-27", 12);
    expect(ends).toHaveLength(12);
    expect(ends[11]).toBe("2026-07-31");
    expect(ends[0]).toBe("2025-08-31");
    expect(ends[6]).toBe("2026-02-28"); // 2026 not a leap year
  });
});

describe("poArrPaise", () => {
  const po: PoArr = {
    poId: "p1",
    orgId: "o1",
    goLive: "2026-01-01",
    moduleIds: [],
    cycleAnnualPaise: [100_00, 112_00, 125_44], // year1, year2(12% up), year3
  };
  it("is ₹0 before go-live", () => {
    expect(poArrPaise(po, "2025-12-31")).toBe(0);
  });
  it("picks the cycle for the current contract year", () => {
    expect(poArrPaise(po, "2026-06-01")).toBe(100_00);
    expect(poArrPaise(po, "2027-06-01")).toBe(112_00);
    expect(poArrPaise(po, "2028-06-01")).toBe(125_44);
  });
  it("repeats the last known cycle beyond the schedule", () => {
    expect(poArrPaise(po, "2035-06-01")).toBe(125_44);
  });
  it("is ₹0 for a one-time PO (no cycles)", () => {
    expect(poArrPaise({ ...po, cycleAnnualPaise: [] }, "2026-06-01")).toBe(0);
  });
});

describe("arr aggregation", () => {
  const pos: PoArr[] = [
    { poId: "a", orgId: "o1", goLive: "2026-01-01", moduleIds: [], cycleAnnualPaise: [100_00] },
    { poId: "b", orgId: "o1", goLive: "2026-01-01", moduleIds: [], cycleAnnualPaise: [50_00] },
    { poId: "c", orgId: "o2", goLive: "2027-01-01", moduleIds: [], cycleAnnualPaise: [80_00] },
  ];
  it("totals live POs as of a date", () => {
    expect(arrTotalAsOf(pos, "2026-06-01")).toBe(150_00); // c not yet live
    expect(arrTotalAsOf(pos, "2027-06-01")).toBe(230_00);
  });
  it("groups by customer and omits ₹0 customers", () => {
    const m = arrByCustomerAsOf(pos, "2026-06-01");
    expect(m.get("o1")).toBe(150_00);
    expect(m.has("o2")).toBe(false); // not live yet
  });
  it("builds a series across dates", () => {
    expect(arrSeries(pos, ["2026-06-01", "2027-06-01"])).toEqual([150_00, 230_00]);
  });
});

describe("revenue recognition (owner's rule)", () => {
  // Go-live 15 Jan 2026. Year 1 recurring ₹1,20,000/yr → ₹10,000/mo. Year 2
  // renewal ₹2,40,000/yr → ₹20,000/mo. One-time hardware ₹50,000.
  const po: PoArr = {
    poId: "p1",
    orgId: "o1",
    goLive: "2026-01-15",
    moduleIds: [],
    cycleAnnualPaise: [120_000_00, 240_000_00],
    oneTimePaise: 50_000_00,
  };

  it("recognises the one-time lump only in the go-live month, on top of recurring 1/12", () => {
    // Go-live month: recurring 1/12 (₹10,000) + full one-time (₹50,000).
    expect(recognizedForMonth(po, "2026-01-31")).toBe(10_000_00 + 50_000_00);
    // Next month: recurring only.
    expect(recognizedForMonth(po, "2026-02-28")).toBe(10_000_00);
  });

  it("recognises ₹0 before go-live", () => {
    expect(recognizedForMonth(po, "2025-12-31")).toBe(0);
  });

  it("switches to the renewal value ÷ 12 in year 2", () => {
    expect(recognizedForMonth(po, "2027-03-31")).toBe(20_000_00); // year-2 monthly, no lump
  });

  it("sums across POs and builds a series", () => {
    const other: PoArr = {
      poId: "p2",
      orgId: "o2",
      goLive: "2026-02-10",
      moduleIds: [],
      cycleAnnualPaise: [60_000_00],
      oneTimePaise: 0,
    };
    // Feb: po recurring ₹10,000 + other recurring ₹5,000 = ₹15,000.
    expect(recognizedTotalForMonth([po, other], "2026-02-28")).toBe(15_000_00);
    const series = recognizedSeries([po, other], ["2026-01-31", "2026-02-28"]);
    expect(series).toEqual([10_000_00 + 50_000_00, 15_000_00]);
  });
});

describe("retention (NRR / GRR)", () => {
  it("expansion lifts NRR above 100% while GRR stays ≤ 100%", () => {
    const start = new Map([["o1", 100_00], ["o2", 100_00]]);
    const now = new Map([["o1", 120_00], ["o2", 100_00]]);
    const r = retention(start, now);
    expect(r.nrr).toBeCloseTo(1.1); // 220 / 200
    expect(r.grr).toBeCloseTo(1.0); // min(120,100)+min(100,100)=200 /200
    expect(r.expansionPaise).toBe(20_00);
    expect(r.contractionPaise).toBe(0);
    expect(r.churnPaise).toBe(0);
  });
  it("separates contraction and churn, and excludes new customers from the ratios", () => {
    const start = new Map([["o1", 100_00], ["o2", 100_00]]);
    const now = new Map([["o1", 60_00], ["o3", 90_00]]); // o2 churned, o3 is new
    const r = retention(start, now);
    expect(r.contractionPaise).toBe(40_00); // o1 100→60
    expect(r.churnPaise).toBe(100_00); // o2 100→0
    expect(r.newArrPaise).toBe(90_00); // o3, not in cohort
    expect(r.nrr).toBeCloseTo(0.3); // (60+0)/200
    expect(r.grr).toBeCloseTo(0.3); // min(60,100)/200
  });
  it("returns null ratios when there is no cohort ARR", () => {
    const r = retention(new Map(), new Map([["o1", 50_00]]));
    expect(r.nrr).toBeNull();
    expect(r.grr).toBeNull();
    expect(r.newArrPaise).toBe(50_00);
  });
});

describe("deltaPct", () => {
  it("computes signed percentage change", () => {
    expect(deltaPct(120, 100)).toBeCloseTo(20);
    expect(deltaPct(80, 100)).toBeCloseTo(-20);
  });
  it("is null when the prior base is 0", () => {
    expect(deltaPct(50, 0)).toBeNull();
  });
});
