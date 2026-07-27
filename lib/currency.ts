export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

// Compact Indian-numbering ₹ for headline figures (KPI tiles): ₹4.2L, ₹1.35Cr,
// ₹85,000. Full precision (formatPaise) is used in tables where every rupee
// should be legible; this is for at-a-glance triage numbers (spec §5).
export function formatPaiseShort(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  // Trim a trailing ".0" so 2.0L reads as ₹2L.
  const trim = (n: number) => n.toFixed(n >= 10 || Number.isInteger(n) ? 0 : 1);
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

// Full-precision ₹ for DETAIL table rows: whole rupees with Indian grouping and
// no decimals (₹90,505, ₹1,50,000). One consistent rule per column so a list
// never mixes "₹1.5L" and "₹90,505" (dashboard brief: consistent formatting).
export function formatPaiseFull(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

// Headline ₹ for the Layer 1 hero tiles: always one decimal for lakh/crore
// figures, with a space before the unit (₹1.6 Cr, ₹18.0 L), and full Indian
// grouping below a lakh (₹90,505). One consistent rule so tiles never mix
// "₹1.5L" and "₹47,094" (dashboard brief: consistent number formatting).
export function formatPaiseHero(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
