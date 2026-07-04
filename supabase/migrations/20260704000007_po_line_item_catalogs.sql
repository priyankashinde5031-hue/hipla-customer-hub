-- Richer PO line items: each purchased thing gets its own Product (from a
-- catalogue), Product category, Cost type and Renewal term. Three of these are
-- new managed catalogues (CLAUDE.md: "reference data is data, not code"),
-- mirroring the existing po_types / cost_types pattern so the same Settings UI
-- manages them. Cost type moves DOWN from the PO header to the line item.
--
-- All four columns are nullable: a line item can be saved with just a
-- description (the "custom / other" case), matching how the other optional PO
-- fields behave. The PO-level purchase_orders.cost_type_id column is LEFT IN
-- PLACE on purpose — dropping a column is destructive and needs sign-off
-- (CLAUDE.md); the app simply stops writing to it.

-- 1. Catalogue tables --------------------------------------------------------
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- e.g. 'Software', 'Hardware', 'Change Request'
  active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- the "what is being purchased" catalogue
  active boolean not null default true
);

create table renewal_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,        -- e.g. 'Annually — 12% escalation', 'Hardware with AMC'
  active boolean not null default true
);

-- 2. Seed starter options ----------------------------------------------------
-- The exact category and renewal-term values Priyanka named. Products are a
-- small realistic starter set — she adds the rest from Settings.
insert into product_categories (name) values
  ('Software'), ('Hardware'), ('Change Request')
on conflict (name) do nothing;

insert into renewal_terms (name) values
  ('Annually — 12% escalation'), ('Hardware — one-time'), ('Hardware with AMC')
on conflict (name) do nothing;

insert into products (name) values
  ('VMS License'), ('Access Control License'), ('Meeting Room Management License'),
  ('Visitor Tablet'), ('Tablet Wall Mount'), ('Installation & Setup'),
  ('Annual Maintenance (AMC)'), ('Custom Development')
on conflict (name) do nothing;

-- 3. New foreign-key columns on po_line_items --------------------------------
alter table po_line_items
  add column product_id           uuid references products(id),
  add column product_category_id  uuid references product_categories(id),
  add column cost_type_id         uuid references cost_types(id),
  add column renewal_term_id      uuid references renewal_terms(id);

create index po_line_items_product_idx          on po_line_items (product_id);
create index po_line_items_product_category_idx on po_line_items (product_category_id);
create index po_line_items_cost_type_idx        on po_line_items (cost_type_id);
create index po_line_items_renewal_term_idx     on po_line_items (renewal_term_id);

-- 4. RLS: read for any active internal user; write for admin/manager ---------
-- Mirrors the catalog policies in 20260627000014 / 20260630000001. Helper
-- functions is_active_internal_user() / is_admin_or_manager() already exist.
alter table product_categories enable row level security;
alter table products           enable row level security;
alter table renewal_terms      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['product_categories', 'products', 'renewal_terms']
  loop
    execute format(
      'create policy %I_select_internal on %I for select to authenticated using (is_active_internal_user());',
      t, t
    );
    execute format(
      'create policy %I_write_admin_manager on %I for insert to authenticated with check (is_admin_or_manager());',
      t, t
    );
    execute format(
      'create policy %I_update_admin_manager on %I for update to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());',
      t, t
    );
  end loop;
end $$;
