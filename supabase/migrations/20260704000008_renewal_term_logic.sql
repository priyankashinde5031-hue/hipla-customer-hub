-- Add a "renewal logic" field to the renewal_terms catalog.
--
-- The name is a free-text label ('Annually — 12% escalation'); `logic` captures
-- the underlying renewal behaviour so it can be selected consistently and, later,
-- drive the Year 2–5 projection maths. Kept as constrained text (not code) per
-- CLAUDE.md: reference data is data.

alter table renewal_terms
  add column logic text;

-- Backfill the three seeded rows to the matching logic.
update renewal_terms set logic = 'Recurring — with escalation' where name = 'Annually — 12% escalation';
update renewal_terms set logic = 'One-time — no renewal'       where name = 'Hardware — one-time';
update renewal_terms set logic = 'AMC — annual maintenance'    where name = 'Hardware with AMC';
