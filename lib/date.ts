// Design system §3: dates render as "30 Jun 2026", never raw ISO. Parses the
// stored YYYY-MM-DD without going through Date() (avoids timezone day-shift).
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${Number(m[3])} ${MONTH_ABBR[Number(m[2]) - 1]} ${m[1]}`;
}

// "Jan 2027" — month + year only, for renewal context lines.
export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${MONTH_ABBR[Number(m[2]) - 1]} ${m[1]}`;
}
