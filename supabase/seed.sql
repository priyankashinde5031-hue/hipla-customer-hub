-- Idempotent seed script. Safe to run more than once: every insert either
-- targets a unique natural key with ON CONFLICT DO NOTHING, or is gated by
-- a "does this already exist" check.

-- ---------------------------------------------------------------------
-- Appendix A.1 — Modules
-- ---------------------------------------------------------------------
insert into modules (name) values
  ('VMS with host'),
  ('VMS without host'),
  ('Meeting Room Management (MRM)'),
  ('Pantry'),
  ('Access Control'),
  ('Attendance'),
  ('Digital Signage'),
  ('Scheduler'),
  ('Phone Booth Management'),
  ('Real Estate VMS')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Appendix A.2 — Entry sources + module mappings
-- ---------------------------------------------------------------------
insert into entry_sources (name) values
  ('VMS Tab'),
  ('Outlook'),
  ('Google'),
  ('Dashboard/app'),
  ('QuickBook'),
  ('Order Placing Tab'),
  ('App'),
  ('Authenticator'),
  ('Slack Integration'),
  ('Notion')
on conflict (name) do nothing;

insert into entry_source_module_map (entry_source_id, module_id)
select es.id, m.id
from (values
  ('VMS Tab', 'VMS with host'),
  ('VMS Tab', 'VMS without host'),
  ('Outlook', 'VMS with host'),
  ('Outlook', 'VMS without host'),
  ('Outlook', 'Meeting Room Management (MRM)'),
  ('Outlook', 'Pantry'),
  ('Google', 'VMS with host'),
  ('Google', 'VMS without host'),
  ('Google', 'Meeting Room Management (MRM)'),
  ('Google', 'Pantry'),
  ('Dashboard/app', 'VMS with host'),
  ('Dashboard/app', 'VMS without host'),
  ('Dashboard/app', 'Meeting Room Management (MRM)'),
  ('Dashboard/app', 'Pantry'),
  ('QuickBook', 'Meeting Room Management (MRM)'),
  ('QuickBook', 'Pantry'),
  ('Order Placing Tab', 'Pantry'),
  ('App', 'Pantry'),
  ('Authenticator', 'Access Control'),
  ('Slack Integration', 'VMS with host'),
  ('Slack Integration', 'VMS without host'),
  ('Notion', 'VMS with host'),
  ('Notion', 'VMS without host'),
  ('Notion', 'Meeting Room Management (MRM)'),
  ('Notion', 'Pantry'),
  ('Notion', 'Access Control'),
  ('Notion', 'Digital Signage'),
  ('Notion', 'Scheduler')
) as map(source_name, module_name)
join entry_sources es on es.name = map.source_name
join modules m on m.name = map.module_name
on conflict (entry_source_id, module_id) do nothing;

-- ---------------------------------------------------------------------
-- Appendix A.3 — Hardware catalog
-- ---------------------------------------------------------------------
insert into hardware_catalog (name, category) values
  ('Lenovo M10', 'Tablet'),
  ('Samsung Galaxy A9 plus', 'Tablet'),
  ('Samsung Galaxy A8', 'Tablet'),
  ('Lenovo M8', 'Tablet'),
  ('Lenovo M7', 'Tablet'),
  ('Hipla Meeting LED Schedulers', 'Tablet'),
  ('Lenovo Tab V7', 'Tablet'),
  ('Samsung F05', 'Tablet'),
  ('Samsung Galaxy A11+ 5G', 'Tablet'),
  ('Silver Mount', 'Mount'),
  ('Black Mount', 'Mount'),
  ('Lumi Mount', 'Mount'),
  ('Standard Mount', 'Mount'),
  ('Wall Mount', 'Mount'),
  ('D-Link Power Supply', 'Accessory'),
  ('Sonoff', 'Accessory'),
  ('Samsung Adaptor', 'Accessory'),
  ('Lenovo Adaptor', 'Accessory'),
  ('Electro Magnetic Lock', 'Accessory'),
  ('Exit Switch', 'Accessory'),
  ('Gangbox Adaptor for Sonoff', 'Accessory'),
  ('Thermal Brother Printer', 'Accessory'),
  ('Printer Rolls', 'Accessory'),
  ('Airtel SIM card', 'Accessory'),
  ('RFID Cards', 'Accessory'),
  ('RFID Reader', 'Accessory'),
  ('Tablet Cover', 'Accessory')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Appendix A.4 — PO types + Cost types
-- ---------------------------------------------------------------------
insert into po_types (name) values
  ('New PO'),
  ('New PO on agreement'),
  ('New PO on invoice'),
  ('Renewal PO'),
  ('Renewal on agreement'),
  ('Renewal on invoice')
on conflict (name) do nothing;

insert into cost_types (name) values
  ('Software'),
  ('Hardware'),
  ('Installation'),
  ('Support & Maintenance')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Appendix A.6 — Support ticket topics
-- ---------------------------------------------------------------------
insert into ticket_topics (name) values
  ('Hardware'),
  ('Configuration'),
  ('Access / Login'),
  ('Training'),
  ('Billing'),
  ('Feature Request'),
  ('Bug'),
  ('Integration'),
  ('Other')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Term lengths (spec §5.4: 1 / 3 / 5 years, configurable)
-- ---------------------------------------------------------------------
insert into term_lengths (label, months) values
  ('1 year', 12),
  ('3 years', 36),
  ('5 years', 60)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------
-- Dummy data: 3 Organizations, each with an HQ Site + 1-2 child Sites.
-- Obviously fake names, per CLAUDE.md's "Data & environments" rule.
-- Gated on organization legal_name so re-running this script is safe.
-- ---------------------------------------------------------------------
do $$
declare
  acme_org_id uuid;
  acme_hq_id uuid;
  acme_pune_id uuid;
  globex_org_id uuid;
  globex_hq_id uuid;
  initech_org_id uuid;
  initech_hq_id uuid;
  initech_blr_id uuid;
  initech_hyd_id uuid;
begin
  if not exists (select 1 from organizations where legal_name = 'Acme Corp Pvt Ltd') then
    insert into organizations (legal_name, brand_name, industry, status)
    values ('Acme Corp Pvt Ltd', 'Acme Corp', 'Manufacturing', 'active')
    returning id into acme_org_id;

    insert into sites (organization_id, name, is_hq, region, status, go_live_date)
    values (acme_org_id, 'Acme Corp HQ - Mumbai', true, 'West', 'live', current_date - interval '400 days')
    returning id into acme_hq_id;

    insert into sites (organization_id, name, is_hq, region, status, go_live_date)
    values (acme_org_id, 'Acme Corp - Pune Office', false, 'West', 'live', current_date - interval '300 days')
    returning id into acme_pune_id;
  end if;

  if not exists (select 1 from organizations where legal_name = 'Globex Industries Ltd') then
    insert into organizations (legal_name, brand_name, industry, status)
    values ('Globex Industries Ltd', 'Globex', 'IT Services', 'active')
    returning id into globex_org_id;

    insert into sites (organization_id, name, is_hq, region, status, go_live_date)
    values (globex_org_id, 'Globex HQ - Bengaluru', true, 'South', 'live', current_date - interval '200 days')
    returning id into globex_hq_id;
  end if;

  if not exists (select 1 from organizations where legal_name = 'Initech Solutions Pvt Ltd') then
    insert into organizations (legal_name, brand_name, industry, status)
    values ('Initech Solutions Pvt Ltd', 'Initech', 'BPO', 'prospect')
    returning id into initech_org_id;

    insert into sites (organization_id, name, is_hq, region, status)
    values (initech_org_id, 'Initech HQ - Hyderabad', true, 'South', 'implementing')
    returning id into initech_hyd_id;

    insert into sites (organization_id, name, is_hq, region, status)
    values (initech_org_id, 'Initech - Bengaluru Office', false, 'South', 'implementing')
    returning id into initech_blr_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Dummy commercials for Acme Corp HQ: one Contract -> one PO -> two
-- Invoices (one cleared, one overdue) -> one Payment.
-- Gated on contract_number so re-running this script is safe.
-- ---------------------------------------------------------------------
do $$
declare
  acme_org_id uuid;
  acme_hq_id uuid;
  term_1yr_id uuid;
  vms_module_id uuid;
  new_po_type_id uuid;
  software_cost_type_id uuid;
  contract_id uuid;
  po_id uuid;
  line_item_id uuid;
  invoice_cleared_id uuid;
  invoice_overdue_id uuid;
begin
  if not exists (select 1 from contracts where contract_number = 'CON-ACME-0001') then
    select id into acme_org_id from organizations where legal_name = 'Acme Corp Pvt Ltd';
    select id into acme_hq_id from sites where name = 'Acme Corp HQ - Mumbai';
    select id into term_1yr_id from term_lengths where label = '1 year';
    select id into vms_module_id from modules where name = 'VMS with host';
    select id into new_po_type_id from po_types where name = 'New PO';
    select id into software_cost_type_id from cost_types where name = 'Software';

    insert into contracts (organization_id, contract_number, go_live_anchor_date, initial_term_id, acv_paise, billing_frequency, payment_terms, status)
    values (acme_org_id, 'CON-ACME-0001', current_date - interval '400 days', term_1yr_id, 50000000, 'Annual', 'Net 30', 'active')
    returning id into contract_id;

    insert into contract_sites (contract_id, site_id) values (contract_id, acme_hq_id);
    insert into contract_modules (contract_id, module_id) values (contract_id, vms_module_id);

    insert into purchase_orders (organization_id, contract_id, po_number, customer_po_ref, po_type_id, cost_type_id, financial_year, po_received_date, gst_percent, payment_terms)
    values (acme_org_id, contract_id, 'PO-ACME-0001', 'ACME/PO/2025/001', new_po_type_id, software_cost_type_id, 'FY2025-26', current_date - interval '395 days', 18.00, 'Net 30')
    returning id into po_id;

    insert into po_sites (po_id, site_id) values (po_id, acme_hq_id);
    insert into po_modules (po_id, module_id) values (po_id, vms_module_id);

    insert into po_line_items (po_id, description, qty, unit_price_paise)
    values (po_id, 'VMS with host - annual subscription', 1, 50000000);

    -- Invoice 1: cleared
    insert into invoices (po_id, contract_id, billed_site_id, invoice_number, amount_paise, gst_number, gst_amount_paise, issue_date, due_date, status)
    values (po_id, contract_id, acme_hq_id, 'INV-ACME-0001', 50000000, '27AAAAA0000A1Z5', 9000000, current_date - interval '390 days', current_date - interval '360 days', 'cleared')
    returning id into invoice_cleared_id;

    insert into payments (invoice_id, amount_paise, received_date, mode, reference)
    values (invoice_cleared_id, 59000000, current_date - interval '365 days', 'Bank Transfer', 'UTR1234567890');

    -- Invoice 2: overdue, unpaid
    insert into invoices (po_id, contract_id, billed_site_id, invoice_number, amount_paise, gst_number, gst_amount_paise, issue_date, due_date, status)
    values (po_id, contract_id, acme_hq_id, 'INV-ACME-0002', 50000000, '27AAAAA0000A1Z5', 9000000, current_date - interval '40 days', current_date - interval '10 days', 'overdue')
    returning id into invoice_overdue_id;
  end if;
end $$;
