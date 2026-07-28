-- Fix the "After 3 Years" / "After 5 Years" renewal terms.
--
-- These terms were created (via Settings) with logic 'One-time — no renewal',
-- which literally means "never renews" — so the value-aware renewal generator
-- computed ₹0 for their years and produced NO renewal rows at all (bug: a
-- recently-made 3-year PO like HIPLA-PO-0192 showed no Year-4/5 renewals, while
-- older POs whose renewals predate the value-aware logic still had theirs).
--
-- The intent of these terms is "the line renews AFTER the initial contract
-- term", with the value basis decided by product CATEGORY (owner rule
-- 2026-07-28):
--   * Software / Opex (Hardware + Software) → base + 25%, held flat each year
--   * every other category                  → 18% AMC of base, each year
-- Captured by the new 'Recurring — by category' logic; the two percentages ride
-- along on the term row (escalation_pct = 25, amc_pct = 18).
--
-- Renewal cadence (which year the first renewal falls in) is unchanged — it is
-- still driven by the PO's Contract time, so a 3-year term still skips Year 2/3
-- and opens Year 4. This migration only fixes the value basis so those years
-- are worth more than ₹0 and therefore get generated.

update renewal_terms
set
  logic = 'Recurring — by category',
  escalation_pct = 25,
  amc_pct = 18
where name in ('After 3 Years', 'After 5 Years');
