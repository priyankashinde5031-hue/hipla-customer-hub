// Business-health money math for the dashboard's Layer 1 (ARR / MRR / Revenue
// this FY / NRR·GRR). Everything is computed on read from the same commercial
// rows the Site 360 uses — nothing is stored (CLAUDE.md: money and derived
// figures are computed, never hand-totaled). Amounts are integer paise.
//
// These are recurring-only figures: one-time line items (hardware, installation,
// one-off change requests) are excluded upstream by their renewal_term logic —
// a "One-time — no renewal" line contributes ₹0 to every cycle (see
// lib/renewals.ts renewalLinePaise), so it never enters ARR.
//
// The pure helpers below are unit-tested (arr-metrics.test.ts) — these are the
// money rules CLAUDE.md says to test first. The DB loader (getHealthMetrics)
// lives in lib/health-metrics.ts and only assembles rows for these helpers.

// ---------------------------------------------------------------------------
// Date helpers (whole-month/-year math, timezone-safe via UTC).
// ---------------------------------------------------------------------------

function parseIso(iso: string | null | undefined): [number, number, number] | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Whole months elapsed from `fromIso` to `toIso`. A partial month only counts
// once the day-of-month is reached (go-live Jan 15 → one month on Feb 15, not
// Feb 1). Negative when `toIso` precedes `fromIso`. Null on bad input.
export function monthsBetween(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): number | null {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  if (!a || !b) return null;
  let months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) months -= 1;
  return months;
}

// 0-based contract year at `atIso` for a license that went live on `goLive`:
// 0 during the first 12 months, 1 in the second year, etc. Null if `atIso` is
// before go-live (not yet live → not in ARR) or either date is unparseable.
export function contractYearIndex(
  goLive: string | null | undefined,
  atIso: string | null | undefined,
): number | null {
  const months = monthsBetween(goLive, atIso);
  if (months === null || months < 0) return null;
  return Math.floor(months / 12);
}

// Start of the Indian financial year (Apr 1) that contains `atIso`, shifted by
// `offsetYears` whole FYs. Before April the FY began the previous calendar year.
export function fyStartIso(atIso: string, offsetYears = 0): string {
  const a = parseIso(atIso);
  if (!a) return atIso;
  const fyYear = (a[1] >= 4 ? a[0] : a[0] - 1) + offsetYears;
  return `${fyYear}-04-01`;
}

// [start, end) bounds of a financial year relative to `atIso`. "this" = the FY
// containing today; "last" = the one before it. End is the next Apr 1 (exclusive).
export function fyBounds(atIso: string, which: "this" | "last"): { start: string; end: string } {
  const start = fyStartIso(atIso, which === "last" ? -1 : 0);
  const y = Number(start.slice(0, 4));
  return { start, end: `${y + 1}-04-01` };
}

// Last day of a month as yyyy-mm-dd. monthIndex0 is 0-11.
function monthEndIso(year: number, monthIndex0: number): string {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const mm = String(monthIndex0 + 1).padStart(2, "0");
  return `${year}-${mm}-${String(last).padStart(2, "0")}`;
}

// The month-end dates of the trailing `n` months ending with the month that
// contains `todayIso`, oldest → newest. Used as the x-axis of the sparklines.
export function trailingMonthEnds(todayIso: string, n = 12): string[] {
  const a = parseIso(todayIso);
  if (!a) return [];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const zeroBased = a[1] - 1 - i; // may be negative → previous years
    const year = a[0] + Math.floor(zeroBased / 12);
    const monthIndex0 = ((zeroBased % 12) + 12) % 12;
    out.push(monthEndIso(year, monthIndex0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-PO ARR contribution.
// ---------------------------------------------------------------------------

// A purchase order reduced to what ARR needs. `cycleAnnualPaise` is the resolved
// recurring annual fee per contract year (index 0 = year 1), already built from
// the projected escalation schedule with any *actual* renewed cycle values
// substituted in — so real expansion/contraction at renewal flows into ARR.
// Empty/all-zero ⇒ a purely one-time PO that never enters ARR.
export type PoArr = {
  poId: string;
  orgId: string | null;
  goLive: string | null; // yyyy-mm-dd; null ⇒ not live ⇒ contributes ₹0
  moduleIds: string[]; // for the product-line filter
  cycleAnnualPaise: number[];
  // Total of this PO's one-time line items (paise). Excluded from ARR; recognised
  // in full in the go-live month by the revenue-recognition helpers. Optional so
  // existing ARR-only callers/tests need not set it (defaults to 0).
  oneTimePaise?: number;
};

// This PO's recurring annual fee as of `atIso`: ₹0 before go-live, otherwise the
// value of the contract year `atIso` falls in. Beyond the last known cycle the
// most recent cycle repeats (a live recurring license keeps renewing).
export function poArrPaise(po: PoArr, atIso: string): number {
  const idx = contractYearIndex(po.goLive, atIso);
  if (idx === null) return 0;
  if (po.cycleAnnualPaise.length === 0) return 0;
  const clamped = Math.min(idx, po.cycleAnnualPaise.length - 1);
  return po.cycleAnnualPaise[clamped] ?? 0;
}

// Total ARR across POs as of a date (point-in-time).
export function arrTotalAsOf(pos: PoArr[], atIso: string): number {
  let total = 0;
  for (const po of pos) total += poArrPaise(po, atIso);
  return total;
}

// ARR grouped by customer (organization) as of a date. Customers with ₹0 are
// omitted so callers can treat "present in the map" as "active".
export function arrByCustomerAsOf(pos: PoArr[], atIso: string): Map<string, number> {
  const byCust = new Map<string, number>();
  for (const po of pos) {
    if (!po.orgId) continue;
    const v = poArrPaise(po, atIso);
    if (v <= 0) continue;
    byCust.set(po.orgId, (byCust.get(po.orgId) ?? 0) + v);
  }
  return byCust;
}

// ARR as of each of the given dates (for the trailing-12m sparkline).
export function arrSeries(pos: PoArr[], dates: string[]): number[] {
  return dates.map((d) => arrTotalAsOf(pos, d));
}

// ---------------------------------------------------------------------------
// Monthly revenue RECOGNITION (owner's rule). Distinct from ARR/MRR:
//   * a recurring line's annual value is recognised evenly, 1/12 per month,
//     for the 12 months of each contract year from go-live (and the renewal
//     value ÷ 12 once a renewal takes over — both already baked into
//     cycleAnnualPaise, so this is just poArrPaise ÷ 12);
//   * a one-time line's full value is recognised once, in the go-live month.
// So the go-live month = that month's recurring 1/12 + the whole one-time lump.
// ---------------------------------------------------------------------------

// True when two yyyy-mm-dd dates fall in the same calendar month.
function sameYearMonth(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.slice(0, 7) === b.slice(0, 7);
}

// Revenue recognised for a single PO in the month ending `monthEndIso`:
// recurring 1/12 (₹0 before go-live) plus the one-time lump if this is the
// go-live month.
export function recognizedForMonth(po: PoArr, monthEndIso: string): number {
  const recurring = Math.round(poArrPaise(po, monthEndIso) / 12);
  const oneTime = sameYearMonth(po.goLive, monthEndIso) ? (po.oneTimePaise ?? 0) : 0;
  return recurring + oneTime;
}

// Total revenue recognised across POs in one month.
export function recognizedTotalForMonth(pos: PoArr[], monthEndIso: string): number {
  let total = 0;
  for (const po of pos) total += recognizedForMonth(po, monthEndIso);
  return total;
}

// Revenue recognised per month across a list of month-end dates (chart series).
export function recognizedSeries(pos: PoArr[], monthEnds: string[]): number[] {
  return monthEnds.map((m) => recognizedTotalForMonth(pos, m));
}

// ---------------------------------------------------------------------------
// Retention (NRR / GRR) + ARR-movement buckets, over a fixed cohort.
// ---------------------------------------------------------------------------

export type Retention = {
  nrr: number | null; // ratio, e.g. 1.08 = 108%. Null when no cohort ARR.
  grr: number | null; // ≤ 1; expansion excluded.
  openArrPaise: number; // cohort ARR at period start
  expansionPaise: number; // growth from still-active cohort customers
  contractionPaise: number; // shrinkage from still-active cohort customers
  churnPaise: number; // ARR lost from cohort customers who went to ₹0
  newArrPaise: number; // ARR from customers not in the cohort (excluded from NRR)
};

// NRR/GRR over the customers active at period start (`startByCust`), comparing
// their ARR now (`nowByCust`). New customers (absent at start) are excluded from
// the ratios but summed into newArrPaise for the movement waterfall (Phase 2).
//   NRR = Σ now(cohort) / Σ start(cohort)
//   GRR = Σ min(now, start) / Σ start(cohort)   (expansion capped away)
export function retention(
  startByCust: Map<string, number>,
  nowByCust: Map<string, number>,
): Retention {
  let openArr = 0;
  let closeCohort = 0;
  let grrClose = 0;
  let expansion = 0;
  let contraction = 0;
  let churn = 0;

  for (const [cust, start] of startByCust) {
    if (start <= 0) continue;
    const now = nowByCust.get(cust) ?? 0;
    openArr += start;
    closeCohort += now;
    grrClose += Math.min(now, start);
    if (now <= 0) churn += start;
    else if (now < start) contraction += start - now;
    else if (now > start) expansion += now - start;
  }

  let newArr = 0;
  for (const [cust, now] of nowByCust) {
    if ((startByCust.get(cust) ?? 0) <= 0 && now > 0) newArr += now;
  }

  return {
    nrr: openArr > 0 ? closeCohort / openArr : null,
    grr: openArr > 0 ? grrClose / openArr : null,
    openArrPaise: openArr,
    expansionPaise: expansion,
    contractionPaise: contraction,
    churnPaise: churn,
    newArrPaise: newArr,
  };
}

// ---------------------------------------------------------------------------
// Deltas.
// ---------------------------------------------------------------------------

// Percentage change from `prior` to `current`. Null when prior is 0 (no
// meaningful base) — callers render "—" / "new" rather than a divide-by-zero.
export function deltaPct(current: number, prior: number): number | null {
  if (!prior) return null;
  return ((current - prior) / prior) * 100;
}
