// Invoice scheduling math. Pure, side-effect-free, and unit-tested
// (CLAUDE.md: "Write tests first for the money math"). All money is integer
// paise; every split is guaranteed to sum back to exactly the input total so
// no rounding ever leaks (spec §4/§12: money is computed, never hand-totaled).

export type MilestoneInstallment = { label: string; percent: number };

export type PaymentTermSpec = {
  scheduleType: "periodic" | "milestone";
  // periodic:
  invoicesPerYear: number | null; // e.g. Monthly = 12, Quarterly = 4
  timing: "advance" | "arrears"; // bill at the start vs end of each period
  // applies to both: days from issue date by which payment is expected.
  billingScheduleDays: number | null;
  // milestone:
  installments: MilestoneInstallment[];
};

export type GeneratedInvoice = {
  label: string; // "Invoice 1 of 2", or the milestone stage name
  amountPaise: number; // ex-tax
  issueDate: string | null; // yyyy-mm-dd (null = user fills in, e.g. milestones)
  dueDate: string | null; // yyyy-mm-dd
};

// Split a total into `count` parts as evenly as possible. The remainder paise
// are spread one-each across the first invoices, so the parts always sum to
// the original total. e.g. (100, 3) -> [34, 33, 33].
export function evenSplitPaise(totalPaise: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalPaise / count);
  let remainder = totalPaise - base * count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

// Split a total by a list of percentages (which should sum to 100). Each part
// is rounded, then any rounding drift is absorbed by the last part so the sum
// is exactly the total. e.g. (20000000, [25,25,50]) -> [5000000,5000000,10000000].
export function percentSplitPaise(totalPaise: number, percents: number[]): number[] {
  if (percents.length === 0) return [];
  const out = percents.map((p) => Math.round((totalPaise * p) / 100));
  const drift = totalPaise - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += drift;
  return out;
}

// Add whole months to a yyyy-mm-dd date, clamping the day to the last day of
// the target month (so 2026-01-31 + 1 month -> 2026-02-28).
export function addMonths(iso: string, months: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = ((totalMonths % 12) + 12) % 12; // 0-based, always positive
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(day, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// Add whole days to a yyyy-mm-dd date.
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// How many invoices a periodic term produces over a contract of `contractMonths`.
// e.g. Quarterly (4/yr) over 12 months = 4; Monthly (12/yr) over 24 months = 24.
// Always at least 1.
export function periodicCount(invoicesPerYear: number, contractMonths: number): number {
  return Math.max(1, Math.round((invoicesPerYear * contractMonths) / 12));
}

// Build the full set of invoices for a PO from its payment term.
export function buildSchedule(args: {
  totalPaise: number; // the PO value being split (ex-tax)
  term: PaymentTermSpec;
  contractMonths: number; // from the PO's Contract time (e.g. "1 year" = 12)
  startDate: string | null; // first invoice date (periodic). null => no dates yet
}): GeneratedInvoice[] {
  const { totalPaise, term, contractMonths, startDate } = args;

  if (term.scheduleType === "milestone") {
    const amounts = percentSplitPaise(
      totalPaise,
      term.installments.map((i) => i.percent),
    );
    // Milestone invoices are event-driven (advance / on delivery / on go-live),
    // so their dates start blank for the user to fill in (Priyanka's decision).
    return term.installments.map((inst, i) => ({
      label: inst.label,
      amountPaise: amounts[i],
      issueDate: null,
      dueDate: null,
    }));
  }

  // periodic
  const ipy = term.invoicesPerYear ?? 1;
  const count = periodicCount(ipy, contractMonths);
  const amounts = evenSplitPaise(totalPaise, count);
  const periodMonths = 12 / ipy;

  return amounts.map((amt, i) => {
    let issueDate: string | null = null;
    let dueDate: string | null = null;
    if (startDate) {
      const periodsElapsed = term.timing === "arrears" ? i + 1 : i;
      issueDate = addMonths(startDate, Math.round(periodsElapsed * periodMonths));
      dueDate =
        term.billingScheduleDays != null
          ? addDays(issueDate, term.billingScheduleDays)
          : issueDate;
    }
    return {
      label: `Invoice ${i + 1} of ${count}`,
      amountPaise: amt,
      issueDate,
      dueDate,
    };
  });
}
