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
