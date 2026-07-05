-- Add an AMC percentage to the renewal_terms catalog, distinct from escalation.
--
-- The two percentages mean different things and drive different renewal maths:
--   * escalation_pct — compounding step-up on a recurring line (base × (1+p)^n)
--   * amc_pct        — annual maintenance as a flat % of the line total (base × p)
-- Only one is relevant per term, gated by `logic`; the other stays null.

alter table renewal_terms
  add column amc_pct numeric(5, 2);
