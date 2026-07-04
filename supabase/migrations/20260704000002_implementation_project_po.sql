-- Link an implementation project to the Purchase Order it delivers.
--
-- Why: a Site can have several projects (spec §5.3), and each drives its own
-- renewal cycle. Renewals already hang off a PO (20260630000005), but their
-- dates were computed from the SITE's single go_live_date — ambiguous once a
-- site has multiple projects/POs. By tying a project to its PO, that project's
-- go-live date anchors THAT PO's renewals precisely (resolved with owner).
--
-- Nullable: a project can exist before its PO is chosen, and legacy/ad-hoc
-- projects need not have one. No unique constraint — kept flexible for now (a
-- PO could, in principle, be re-implemented later).
alter table implementation_projects
  add column po_id uuid references purchase_orders(id);

create index implementation_projects_po_idx on implementation_projects (po_id);
