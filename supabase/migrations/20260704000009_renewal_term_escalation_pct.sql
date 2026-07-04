-- Add a structured escalation percentage to the renewal_terms catalog.
--
-- Complements the free-text name and the `logic` field: for 'Recurring — with
-- escalation' terms this is the yearly step-up (e.g. 12) so the Year 2–5
-- projection maths can be driven from data rather than parsed out of the name.
-- Null for terms that don't escalate (flat / one-time / AMC).

alter table renewal_terms
  add column escalation_pct numeric(5, 2);

-- Backfill the seeded escalating term (12% named in 'Annually — 12% escalation').
update renewal_terms set escalation_pct = 12 where name = 'Annually — 12% escalation';
