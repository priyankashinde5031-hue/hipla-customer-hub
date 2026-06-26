-- PurchaseOrder = a customer's commitment to pay. Owned by an Organization,
-- covers one or more Sites, optionally linked to a Contract. Spec §5.4.
-- No stored PO value column: it is always the sum of po_line_items (see the
-- po_value view in a later migration). This enforces "money is computed,
-- never hand-totaled" (spec §4, §12).
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contract_id uuid references contracts(id),
  po_number text not null unique,
  customer_po_ref text,
  po_type_id uuid references po_types(id),
  cost_type_id uuid references cost_types(id),
  financial_year text,
  po_received_date date,
  gst_percent numeric(5,2),
  payment_terms text,
  attachment_id uuid references attachments(id),
  created_at timestamptz not null default now()
);

create index purchase_orders_organization_idx on purchase_orders (organization_id);
create index purchase_orders_contract_idx on purchase_orders (contract_id);

create table po_sites (
  po_id uuid not null references purchase_orders(id),
  site_id uuid not null references sites(id),
  primary key (po_id, site_id)
);

create table po_modules (
  po_id uuid not null references purchase_orders(id),
  module_id uuid not null references modules(id),
  primary key (po_id, module_id)
);

create table po_line_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id),
  description text not null,
  qty numeric(12,2) not null check (qty > 0),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  amount_paise bigint generated always as (round(qty * unit_price_paise)::bigint) stored,
  created_at timestamptz not null default now()
);

create index po_line_items_po_idx on po_line_items (po_id);
