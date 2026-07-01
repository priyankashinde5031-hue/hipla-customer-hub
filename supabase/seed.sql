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
-- Purchase Order dropdowns (managed in Settings; see migration
-- 20260630000001). Financial year / Payment terms / Contract time.
-- ---------------------------------------------------------------------
insert into financial_years (name) values
  ('FY2023-24'), ('FY2024-25'), ('FY2025-26'), ('FY2026-27'), ('FY2027-28')
on conflict (name) do nothing;

-- Payment terms define how a PO splits into invoices (see migration
-- 20260630000002). periodic = N invoices/year; milestone = named % stages.
insert into payment_terms (name, schedule_type, invoices_per_year, timing, billing_schedule_days) values
  ('Advance',            'periodic',  1, 'advance',  0),
  ('On receipt',         'periodic',  1, 'advance',  0),
  ('Net 15',             'periodic',  1, 'advance', 15),
  ('Net 30',             'periodic',  1, 'advance', 30),
  ('Net 45',             'periodic',  1, 'advance', 45),
  ('Net 60',             'periodic',  1, 'advance', 60),
  ('Net 90',             'periodic',  1, 'advance', 90),
  ('Monthly',            'periodic', 12, 'advance',  0),
  ('Quarterly advance',  'periodic',  4, 'advance',  0),
  ('Half-yearly advance', 'periodic', 2, 'advance',  0),
  ('Annual advance',     'periodic',  1, 'advance',  0)
on conflict (name) do nothing;

do $$
declare
  mt_id uuid;
begin
  if not exists (select 1 from payment_terms where name = '25 / 25 / 50 milestones') then
    insert into payment_terms (name, schedule_type, invoices_per_year, timing, billing_schedule_days)
    values ('25 / 25 / 50 milestones', 'milestone', null, 'advance', 15)
    returning id into mt_id;
    insert into payment_term_installments (payment_term_id, sort_order, label, percent) values
      (mt_id, 1, 'Advance', 25),
      (mt_id, 2, 'On material delivery', 25),
      (mt_id, 3, 'On go-live', 50);
  end if;
end $$;

insert into contract_times (name, months) values
  ('1 year', 12), ('2 years', 24), ('3 years', 36), ('5 years', 60)
on conflict (name) do nothing;

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
  fy_2025_id uuid;
  net30_id uuid;
  contract_time_1yr_id uuid;
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
    select id into fy_2025_id from financial_years where name = 'FY2025-26';
    select id into net30_id from payment_terms where name = 'Net 30';
    select id into contract_time_1yr_id from contract_times where name = '1 year';

    insert into contracts (organization_id, contract_number, go_live_anchor_date, initial_term_id, acv_paise, billing_frequency, payment_terms, status)
    values (acme_org_id, 'CON-ACME-0001', current_date - interval '400 days', term_1yr_id, 50000000, 'Annual', 'Net 30', 'active')
    returning id into contract_id;

    insert into contract_sites (contract_id, site_id) values (contract_id, acme_hq_id);
    insert into contract_modules (contract_id, module_id) values (contract_id, vms_module_id);

    insert into purchase_orders (organization_id, contract_id, po_number, customer_po_ref, po_type_id, cost_type_id, financial_year, financial_year_id, po_received_date, gst_percent, payment_terms, payment_terms_id, contract_time_id)
    values (acme_org_id, contract_id, 'PO-ACME-0001', 'ACME/PO/2025/001', new_po_type_id, software_cost_type_id, 'FY2025-26', fy_2025_id, current_date - interval '395 days', 18.00, 'Net 30', net30_id, contract_time_1yr_id)
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

-- ---------------------------------------------------------------------
-- A multi-site sample PO (covers Mumbai HQ + Pune) so the invoice
-- "Bill to site" picker has something to demonstrate. No invoices —
-- generate them from the app to exercise the picker.
-- ---------------------------------------------------------------------
do $$
declare
  acme_org_id uuid;
  hq_id uuid;
  pune_id uuid;
  vms_id uuid;
  ms_po_id uuid;
begin
  if not exists (select 1 from purchase_orders where name = 'Acme multi-site rollout — VMS (sample)') then
    select id into acme_org_id from organizations where legal_name = 'Acme Corp Pvt Ltd';
    select id into hq_id from sites where name = 'Acme Corp HQ - Mumbai';
    select id into pune_id from sites where name = 'Acme Corp - Pune Office';
    select id into vms_id from modules where name = 'VMS with host';

    insert into purchase_orders (
      organization_id, name, po_type_id, cost_type_id, financial_year_id,
      payment_terms_id, contract_time_id, po_received_date, gst_percent
    )
    values (
      acme_org_id, 'Acme multi-site rollout — VMS (sample)',
      (select id from po_types where name = 'New PO'),
      (select id from cost_types where name = 'Software'),
      (select id from financial_years where name = 'FY2025-26'),
      (select id from payment_terms where name = 'Half-yearly advance'),
      (select id from contract_times where name = '1 year'),
      '2026-01-01', 18.00
    )
    returning id into ms_po_id;

    insert into po_sites (po_id, site_id) values (ms_po_id, hq_id), (ms_po_id, pune_id);
    insert into po_modules (po_id, module_id) values (ms_po_id, vms_id);
    insert into po_line_items (po_id, description, qty, unit_price_paise)
    values (ms_po_id, 'VMS rollout — Mumbai + Pune (annual)', 1, 40000000);

    -- Year 2–5 renewal projections for the sample PO. In the app these are
    -- auto-generated on PO creation; seeded here so the section demos with data.
    -- 1-year term, anchored to HQ → Year 2,3,4,5. Expected = the Year-1 PO value.
    insert into renewals (po_id, organization_id, anchor_site_id, year_number, offset_months, term_months, expected_value_paise)
    values
      (ms_po_id, acme_org_id, hq_id, 2, 12, 12, 40000000),
      (ms_po_id, acme_org_id, hq_id, 3, 24, 12, 40000000),
      (ms_po_id, acme_org_id, hq_id, 4, 36, 12, 40000000),
      (ms_po_id, acme_org_id, hq_id, 5, 48, 12, 40000000);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- First admin account. Pre-provisioned so Priyanka can log in once auth
-- is wired up; auth_user_id is linked automatically on first sign-in
-- (see app/auth/callback/route.ts).
-- ---------------------------------------------------------------------
insert into internal_users (email, name, role)
values ('priyanka.s@hipla.io', 'Priyanka Shinde', 'admin')
on conflict (email) do nothing;
