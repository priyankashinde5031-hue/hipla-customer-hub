-- Link a renewal's payment terms to the Settings-managed payment_terms catalog
-- (CLAUDE.md: "reference data is data, not code"), instead of free text. The
-- catalog row already carries the billing schedule (schedule_type, invoices
-- per year, timing, credit days — see 20260630000002), so picking a term links
-- the billing schedule too.
--
-- The old free-text renewals.payment_terms column is LEFT IN PLACE (dropping is
-- destructive and needs sign-off, per CLAUDE.md). The app reads/writes the new
-- id column from here on.
alter table renewals
  add column payment_terms_id uuid references payment_terms(id);

create index renewals_payment_terms_idx on renewals (payment_terms_id);
