-- Editable renewal date. Until now the renewal date was ALWAYS computed on read
-- from the anchor project's go-live date + offset_months (see 20260630000005).
-- Owner ask: keep that automatic link, but let a user override the date per
-- renewal year when the real renewal falls on a different day.
--
-- The override is nullable: null = "follow the go-live-driven date" (the default
-- and still the norm); a set value = "use exactly this date". The computed date
-- is never stored — only the manual override is. // DECISION: spec §5.4
alter table renewals
  add column renewal_date_override date;

comment on column renewals.renewal_date_override is
  'Manual renewal date. When null, the renewal date is computed from the anchor go-live date + offset_months. When set, it overrides that computed date.';
