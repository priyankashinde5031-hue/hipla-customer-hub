-- RLS scaffolding (spec §9). Enabled on every table now, with no policies
-- yet, so nothing is reachable via the public API by default — only the
-- server-side service-role key (used by our Next.js server code) bypasses
-- RLS. Real per-role policies (admin/manager/cs_onboarding/read_only) will
-- be added once auth is wired up and we know the Hipla email domain to
-- restrict sign-ups to.
-- DECISION: domain-based and role-based policies deferred — see spec §9.
-- Flagged in hand-off notes as a question for Priyanka.

alter table internal_users enable row level security;
alter table audit_log enable row level security;
alter table organizations enable row level security;
alter table sites enable row level security;
alter table modules enable row level security;
alter table entry_sources enable row level security;
alter table entry_source_module_map enable row level security;
alter table hardware_catalog enable row level security;
alter table cost_types enable row level security;
alter table po_types enable row level security;
alter table ticket_topics enable row level security;
alter table term_lengths enable row level security;
alter table attachments enable row level security;
alter table contracts enable row level security;
alter table contract_sites enable row level security;
alter table contract_modules enable row level security;
alter table purchase_orders enable row level security;
alter table po_sites enable row level security;
alter table po_modules enable row level security;
alter table po_line_items enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
