-- Link invoices generated for a renewal year back to that renewal.
--
-- When a renewal is marked done, invoices are auto-split from its payment term
-- (same logic as the PO's "Generate invoices"). Those invoices still trace to
-- the origin PO (po_id) so they roll up in the PO's money totals, but renewal_id
-- distinguishes them from the Year-1 invoices and ties them to the exact year.

alter table invoices
  add column renewal_id uuid references renewals(id);

create index invoices_renewal_idx on invoices (renewal_id);
