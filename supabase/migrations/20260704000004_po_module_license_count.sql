-- License counts per module on a Purchase Order.
--
-- Each module a PO covers is treated as a "license" (see the Site 360 Licenses
-- card). The owner wants to record HOW MANY licenses of each module a PO buys,
-- so the count lives on the po_modules link row: one count per (PO, module).
--
-- Nullable on purpose — existing PO/module links pre-date this field and simply
-- have no count recorded yet ("—"). When set it must be non-negative; 0 is a
-- valid explicit "none". This is entered data, not a computed total, so unlike
-- money it is stored directly (CLAUDE.md: only *derivable* totals are computed).

alter table po_modules
  add column license_count integer
    check (license_count is null or license_count >= 0);
