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

// Today's local date as YYYY-MM-DD, for seeding date inputs. Uses the browser's
// local calendar day (IST for our users) rather than UTC, so a value entered
// late in the evening doesn't jump to the next day.
export function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// "Jan 2027" — month + year only, for renewal context lines.
export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${MONTH_ABBR[Number(m[2]) - 1]} ${m[1]}`;
}

// "2 mins ago" / "3 hours ago" / "5 days ago" — for "last updated" and autosave
// indicators. Takes a full timestamptz (not a date-only string). Falls back to
// the absolute date past a week so old items stay unambiguous.
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso.slice(0, 10));
}
