-- Feature: per-renewal-year "Hardware AMC provided by customer? yes/no".
--
-- One answer per renewal year (one row per PO×year already), so this is a
-- single NULLABLE boolean on the renewal row:
--   true  → AMC for the site's hardware is provided by the customer that year
--   false → it is not (Hipla / other)
--   null  → not answered yet (the default the UI suggests from hardware
--           ownership, but nothing is stored until someone saves/marks renewed)
--
-- Nullable + no backfill: every existing renewal (including already-"renewed"
-- rows) keeps its exact data and reads as "unset". Distinct from
-- renewal_terms.amc_pct, which is a revenue-math percentage, not this yes/no.
--
-- "Logged whenever a renewal happens": the value is written through the normal
-- updateRenewal audit entry, and markRenewalDone folds it into the "renewed"
-- audit record — see renewal-actions.ts.

alter table renewals add column hardware_amc_by_customer boolean;

comment on column renewals.hardware_amc_by_customer is
  'Per-year: is AMC for the site hardware provided by the customer? true/false, null = unanswered.';
