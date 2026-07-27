-- Cost types carry whether their value is annually recurring or one-time.
--
-- The owner's rule for ARR/MRR + monthly revenue recognition keys off the LINE
-- ITEM's cost type: a "recurring" cost type spreads its value over 12 months
-- from the go-live month (and enters ARR); a "one-time" cost type is recognised
-- in full in the go-live month and never enters ARR. This moves the recurring
-- vs one-time decision onto Cost type (previously it was inferred from the
-- Renewal term). Renewal term still shapes HOW a recurring line escalates.
--
-- Stored as constrained text (CLAUDE.md: reference data is data), matching the
-- human-readable values shown in the Settings dropdown.

-- Idempotent (add column if not exists) so it is safe whether it is applied via
-- `supabase db push` or pasted into the dashboard SQL editor — running it twice
-- is a harmless no-op and never touches existing rows.
alter table cost_types
  add column if not exists recurrence text not null default 'Recurring'
    check (recurrence in ('Recurring', 'One-time'));

-- Backfill the seeded cost types to sensible defaults. Hardware and Installation
-- are one-time; Software and Support & Maintenance are recurring (the column
-- default already covers the recurring ones). The owner can re-tag any of these
-- from Settings → Cost Types.
update cost_types set recurrence = 'One-time'
  where name in ('Hardware', 'Installation');
