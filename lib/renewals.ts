// Renewal projection math. Pure, side-effect-free, and unit-tested
// (CLAUDE.md: "Write tests first for the … renewal/deviation logic"). The
// cadence is driven by the contract term in MONTHS — never hardcoded to 1 year
// — so multi-year initial terms and (later) multi-year renewal cycles work.
//
// Rule (confirmed with owner):
//   * first renewal = go-live + initialTermMonths
//   * each subsequent renewal = previous + renewalIntervalMonths (default 12)
//   * generate while the renewal's contract year ≤ horizonYears (default 5)
// So a 1-year term yields Year 2,3,4,5; a 3-year term yields Year 4,5; a 5-year
// term yields nothing inside a 5-year horizon.

export type RenewalCycle = {
  yearNumber: number; // the contract year this renewal begins (2,3,4,5…)
  offsetMonths: number; // months from go-live to this renewal date
  termMonths: number; // this cycle's length
};

export function generateRenewalSchedule(
  initialTermMonths: number,
  horizonYears = 5,
  renewalIntervalMonths = 12,
): RenewalCycle[] {
  const term = Number.isFinite(initialTermMonths) && initialTermMonths > 0
    ? Math.round(initialTermMonths)
    : 12;
  const interval = Number.isFinite(renewalIntervalMonths) && renewalIntervalMonths > 0
    ? Math.round(renewalIntervalMonths)
    : 12;

  const cycles: RenewalCycle[] = [];
  for (let offset = term; ; offset += interval) {
    // Contract year a renewal at `offset` months begins. offset 12 → year 2.
    const yearNumber = Math.floor(offset / 12) + 1;
    if (yearNumber > horizonYears) break;
    cycles.push({ yearNumber, offsetMonths: offset, termMonths: interval });
    // Safety stop in case of degenerate inputs.
    if (cycles.length > 100) break;
  }
  return cycles;
}

// Add a whole number of months to a yyyy-mm-dd date, returning yyyy-mm-dd.
// Clamps to the last valid day if the target month is shorter (e.g. Jan 31 +
// 1 month → Feb 28/29). Returns null if the input isn't a valid date.
export function addMonths(isoDate: string | null | undefined, months: number): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);

  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12; // 0-11
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  const mm = String(targetMonth + 1).padStart(2, "0");
  const dd = String(targetDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

// Renewal date = go-live + offset months. Null go-live → null (UI shows "—").
export function renewalDate(goLiveDate: string | null | undefined, offsetMonths: number): string | null {
  return addMonths(goLiveDate, offsetMonths);
}

// One PO line's Year-1 baseline plus the annual escalation carried by its
// renewal term. `escalationPct` is the per-year step-up (e.g. 12 for 12%);
// null/0/absent means the line stays flat on renewal.
export type EscalatingLine = {
  basePaise: number; // qty × unit price for this line, in paise
  escalationPct: number | null | undefined; // per-year %, from the renewal term
};

// Expected renewal value (paise) for the contract year `yearNumber`, escalating
// each line from its Year-1 base by its own annual %, compounding once per
// contract year elapsed: year 2 = base × (1 + pct/100)^1, year 3 → ^2, and so
// on. Lines with no escalation % stay flat. Rounded per line to whole paise so
// the projection stays an integer (CLAUDE.md: money is integer paise).
export function escalatedExpectedPaise(
  lines: EscalatingLine[],
  yearNumber: number,
): number {
  const yearsElapsed = Number.isFinite(yearNumber) ? Math.max(0, Math.round(yearNumber) - 1) : 0;
  return lines.reduce((sum, line) => {
    const pct = line.escalationPct && line.escalationPct > 0 ? line.escalationPct : 0;
    const factor = Math.pow(1 + pct / 100, yearsElapsed);
    return sum + Math.round(line.basePaise * factor);
  }, 0);
}

// Deviation % = ((actual − expected) / expected) × 100. By rule, 0% when the
// expected value is 0, null, or missing (no baseline to deviate from).
export function deviationPercent(
  actualPaise: number | null | undefined,
  expectedPaise: number | null | undefined,
): number {
  if (!expectedPaise || expectedPaise <= 0) return 0;
  if (actualPaise === null || actualPaise === undefined) return 0;
  return ((actualPaise - expectedPaise) / expectedPaise) * 100;
}
