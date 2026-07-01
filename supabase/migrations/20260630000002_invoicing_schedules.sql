-- Invoicing schedules. A Payment Term stops being a plain label and becomes
-- the definition of HOW a PO's value is split into invoices (Priyanka's
-- 2026-06-30 decision). Two kinds:
--   * periodic  — N invoices per year, multiplied by the contract length and
--                 split equally (Monthly=12, Quarterly=4, Half-yearly=2, Annual=1).
--   * milestone — named stages each with a % (e.g. 25 / 25 / 50), one invoice each.
-- Plus a "billing schedule" = days from issue by which payment is expected
-- (drives the invoice due date; later feeds a dashboard metric).

-- 1. Enrich payment_terms -----------------------------------------------------
alter table payment_terms
  add column schedule_type text not null default 'periodic'
    check (schedule_type in ('periodic', 'milestone')),
  add column invoices_per_year integer
    check (invoices_per_year is null or invoices_per_year > 0),
  add column timing text not null default 'advance'
    check (timing in ('advance', 'arrears')),
  add column billing_schedule_days integer
    check (billing_schedule_days is null or billing_schedule_days >= 0);

-- Backfill the existing simple rows so they remain valid as periodic terms
-- (1 invoice per contract year) and carry their credit period in days.
update payment_terms set invoices_per_year = 1 where schedule_type = 'periodic';
update payment_terms set billing_schedule_days = 15 where name = 'Net 15';
update payment_terms set billing_schedule_days = 30 where name = 'Net 30';
update payment_terms set billing_schedule_days = 45 where name = 'Net 45';
update payment_terms set billing_schedule_days = 60 where name = 'Net 60';
update payment_terms set billing_schedule_days = 90 where name = 'Net 90';
update payment_terms set billing_schedule_days = 0  where name in ('Advance', 'On receipt');

-- Now enforce: periodic terms must have a per-year count; milestone terms must not.
alter table payment_terms add constraint payment_term_split_valid check (
  (schedule_type = 'periodic' and invoices_per_year is not null and invoices_per_year > 0)
  or (schedule_type = 'milestone' and invoices_per_year is null)
);

-- 2. Milestone installments (only used by milestone terms) --------------------
create table payment_term_installments (
  id uuid primary key default gen_random_uuid(),
  payment_term_id uuid not null references payment_terms(id) on delete cascade,
  sort_order integer not null,
  label text not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  unique (payment_term_id, sort_order)
);

create index payment_term_installments_term_idx
  on payment_term_installments (payment_term_id);

alter table payment_term_installments enable row level security;

create policy payment_term_installments_select_internal
  on payment_term_installments for select to authenticated
  using (is_active_internal_user());
create policy payment_term_installments_write_admin_manager
  on payment_term_installments for insert to authenticated
  with check (is_admin_or_manager());
create policy payment_term_installments_update_admin_manager
  on payment_term_installments for update to authenticated
  using (is_admin_or_manager()) with check (is_admin_or_manager());
create policy payment_term_installments_delete_admin_manager
  on payment_term_installments for delete to authenticated
  using (is_admin_or_manager());

-- 3. Contract time needs a numeric length for the per-year math --------------
alter table contract_times add column months integer;

update contract_times set months = 12 where name = '1 year';
update contract_times set months = 24 where name = '2 years';
update contract_times set months = 36 where name = '3 years';
update contract_times set months = 60 where name = '5 years';

-- Anything not matched (custom rows) defaults to a year; settings UI requires
-- a real value going forward. // DECISION: spec §5.4 (term length configurable).
alter table contract_times alter column months set default 12;
update contract_times set months = 12 where months is null;
alter table contract_times alter column months set not null;

-- 4. System-generated invoice reference HIPLA-INV-0001, 0002, ... -------------
create sequence if not exists invoice_number_seq;
select setval(
  'invoice_number_seq',
  greatest(
    1,
    coalesce(
      (select max((regexp_replace(invoice_number, '\D', '', 'g'))::bigint)
       from invoices
       where invoice_number ~ '\d'),
      0
    ) + 1
  ),
  false
);
alter table invoices
  alter column invoice_number set default
    'HIPLA-INV-' || lpad(nextval('invoice_number_seq')::text, 4, '0');

-- 5. Seed a few example schedules (Priyanka customizes the rest in Settings) --
insert into payment_terms (name, schedule_type, invoices_per_year, timing, billing_schedule_days) values
  ('Monthly',            'periodic', 12, 'advance', 0),
  ('Quarterly advance',  'periodic',  4, 'advance', 0),
  ('Half-yearly advance', 'periodic', 2, 'advance', 0),
  ('Annual advance',     'periodic',  1, 'advance', 0)
on conflict (name) do nothing;

-- A milestone example: 25% advance / 25% on delivery / 50% on go-live.
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
