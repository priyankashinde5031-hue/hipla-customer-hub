// Usage-health categorization (spec §5.10). Pure functions so the thresholds
// are unit-tested — this is a derived rule of exactly the kind CLAUDE.md says
// to test first (like the money/aging math).

export type UsageCategory = "Unknown" | "No Usage" | "Low" | "Healthy" | "Heavy";

// Compare a per-week actual against the expected entries-per-week target.
//
// DECISION (spec §5.10, thresholds not fixed in spec — v1 assumption, confirm
// with Priyanka): No Usage = 0 actual; Low = under half of expected; Healthy =
// half to 1.5×; Heavy = 1.5× or more. No target set ⇒ Unknown.
export function usageCategory(
  actualPerWeek: number,
  expectedPerWeek: number,
): UsageCategory {
  if (!Number.isFinite(expectedPerWeek) || expectedPerWeek <= 0) return "Unknown";
  if (actualPerWeek <= 0) return "No Usage";
  const ratio = actualPerWeek / expectedPerWeek;
  if (ratio < 0.5) return "Low";
  if (ratio < 1.5) return "Healthy";
  return "Heavy";
}

// Maps a category to the semantic status token used by the StatusBadge styling
// (docs/design-system.md §4). Not a raw color — the component turns it into the
// right soft-bg + text pair.
export type StatusTone = "live" | "warning" | "danger" | "neutral";

export function usageCategoryTone(category: UsageCategory): StatusTone {
  switch (category) {
    case "No Usage":
      return "danger";
    case "Low":
      return "warning";
    case "Healthy":
    case "Heavy":
      return "live";
    case "Unknown":
    default:
      return "neutral";
  }
}
