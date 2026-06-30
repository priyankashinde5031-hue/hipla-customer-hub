import { describe, it, expect } from "vitest";
import {
  evenSplitPaise,
  percentSplitPaise,
  addMonths,
  addDays,
  periodicCount,
  buildSchedule,
  type PaymentTermSpec,
} from "./invoicing";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ₹2,00,000 in paise
const TWO_LAKH = 20000000;

describe("evenSplitPaise", () => {
  it("splits ₹2L into two equal halves", () => {
    expect(evenSplitPaise(TWO_LAKH, 2)).toEqual([10000000, 10000000]);
  });

  it("spreads the remainder so parts always sum to the total", () => {
    const parts = evenSplitPaise(100, 3);
    expect(parts).toEqual([34, 33, 33]);
    expect(sum(parts)).toBe(100);
  });

  it("never leaks paise for a 12-way monthly split", () => {
    const parts = evenSplitPaise(100000001, 12); // odd amount
    expect(parts).toHaveLength(12);
    expect(sum(parts)).toBe(100000001);
  });

  it("returns empty for non-positive counts", () => {
    expect(evenSplitPaise(100, 0)).toEqual([]);
  });
});

describe("percentSplitPaise", () => {
  it("splits ₹2L by 25/25/50", () => {
    expect(percentSplitPaise(TWO_LAKH, [25, 25, 50])).toEqual([
      5000000, 5000000, 10000000,
    ]);
  });

  it("absorbs rounding drift so the sum is exact", () => {
    const parts = percentSplitPaise(1000, [33.33, 33.33, 33.34]);
    expect(sum(parts)).toBe(1000);
  });
});

describe("addMonths / addDays", () => {
  it("adds months across a year boundary", () => {
    expect(addMonths("2026-07-01", 6)).toBe("2027-01-01");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-01-15", 30)).toBe("2026-02-14");
  });
});

describe("periodicCount", () => {
  it("quarterly over a 1-year contract = 4", () => {
    expect(periodicCount(4, 12)).toBe(4);
  });
  it("monthly over a 2-year contract = 24", () => {
    expect(periodicCount(12, 24)).toBe(24);
  });
  it("half-yearly over a 1-year contract = 2", () => {
    expect(periodicCount(2, 12)).toBe(2);
  });
  it("never returns less than 1", () => {
    expect(periodicCount(1, 0)).toBe(1);
  });
});

describe("buildSchedule — periodic", () => {
  const halfYearly: PaymentTermSpec = {
    scheduleType: "periodic",
    invoicesPerYear: 2,
    timing: "advance",
    billingScheduleDays: 30,
    installments: [],
  };

  it("₹2L half-yearly advance over 1 year = two ₹1L invoices, spaced 6 months", () => {
    const invs = buildSchedule({
      totalPaise: TWO_LAKH,
      term: halfYearly,
      contractMonths: 12,
      startDate: "2026-01-01",
    });
    expect(invs).toHaveLength(2);
    expect(invs.map((i) => i.amountPaise)).toEqual([10000000, 10000000]);
    expect(sum(invs.map((i) => i.amountPaise))).toBe(TWO_LAKH);
    expect(invs[0].issueDate).toBe("2026-01-01");
    expect(invs[1].issueDate).toBe("2026-07-01");
    // due = issue + 30 days
    expect(invs[0].dueDate).toBe("2026-01-31");
  });

  it("arrears bills at the end of each period", () => {
    const invs = buildSchedule({
      totalPaise: TWO_LAKH,
      term: { ...halfYearly, timing: "arrears" },
      contractMonths: 12,
      startDate: "2026-01-01",
    });
    expect(invs[0].issueDate).toBe("2026-07-01");
    expect(invs[1].issueDate).toBe("2027-01-01");
  });

  it("monthly over 2 years = 24 invoices summing to the total", () => {
    const invs = buildSchedule({
      totalPaise: TWO_LAKH,
      term: { ...halfYearly, invoicesPerYear: 12 },
      contractMonths: 24,
      startDate: "2026-01-01",
    });
    expect(invs).toHaveLength(24);
    expect(sum(invs.map((i) => i.amountPaise))).toBe(TWO_LAKH);
  });

  it("leaves dates blank when no start date is given", () => {
    const invs = buildSchedule({
      totalPaise: TWO_LAKH,
      term: halfYearly,
      contractMonths: 12,
      startDate: null,
    });
    expect(invs[0].issueDate).toBeNull();
    expect(invs[0].dueDate).toBeNull();
  });
});

describe("buildSchedule — milestone", () => {
  const milestone: PaymentTermSpec = {
    scheduleType: "milestone",
    invoicesPerYear: null,
    timing: "advance",
    billingScheduleDays: 15,
    installments: [
      { label: "Advance", percent: 25 },
      { label: "On material delivery", percent: 25 },
      { label: "On go-live", percent: 50 },
    ],
  };

  it("₹2L 25/25/50 = three invoices by stage, dates blank", () => {
    const invs = buildSchedule({
      totalPaise: TWO_LAKH,
      term: milestone,
      contractMonths: 12,
      startDate: "2026-01-01",
    });
    expect(invs).toHaveLength(3);
    expect(invs.map((i) => i.label)).toEqual([
      "Advance",
      "On material delivery",
      "On go-live",
    ]);
    expect(invs.map((i) => i.amountPaise)).toEqual([5000000, 5000000, 10000000]);
    expect(sum(invs.map((i) => i.amountPaise))).toBe(TWO_LAKH);
    expect(invs.every((i) => i.issueDate === null && i.dueDate === null)).toBe(true);
  });
});
