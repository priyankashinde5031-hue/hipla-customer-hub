-- Invoice = a demand for payment, billed to exactly one Site. Must trace to
-- a PO and/or a Contract (Priyanka's 2026-06-27 decision: at least one of
-- po_id / contract_id required, both allowed). Spec §5.4.
create table invoices (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id),
  contract_id uuid references contracts(id),
  billed_site_id uuid not null references sites(id),
  invoice_number text not null unique,
  amount_paise bigint not null check (amount_paise >= 0), -- ex-tax
  gst_number text,
  gst_amount_paise bigint not null default 0 check (gst_amount_paise >= 0), -- entered, not computed (spec §13.7)
  total_paise bigint generated always as (amount_paise + gst_amount_paise) stored,
  issue_date date,
  due_date date,
  status text not null default 'draft'
    check (status in ('draft', 'raised', 'due', 'overdue', 'part-paid', 'cleared', 'cancelled')),
  attachment_id uuid references attachments(id),
  created_at timestamptz not null default now(),

  constraint invoice_must_trace_to_po_or_contract check (po_id is not null or contract_id is not null)
);

create index invoices_billed_site_idx on invoices (billed_site_id);
create index invoices_po_idx on invoices (po_id);
create index invoices_contract_idx on invoices (contract_id);
create index invoices_due_date_idx on invoices (due_date);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  amount_paise bigint not null check (amount_paise > 0),
  received_date date not null,
  mode text,
  reference text,
  created_at timestamptz not null default now()
);

create index payments_invoice_idx on payments (invoice_id);
