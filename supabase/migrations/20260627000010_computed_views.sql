-- Computed-on-read views. Nothing here is stored; every figure is derived
-- from the underlying rows each time it's queried (spec §4: "money is
-- computed, never hand-totaled").

create view po_totals as
select
  po_id,
  sum(amount_paise) as po_value_paise
from po_line_items
group by po_id;

create view invoice_balances as
select
  i.id as invoice_id,
  i.total_paise,
  coalesce(sum(p.amount_paise), 0) as paid_paise,
  i.total_paise - coalesce(sum(p.amount_paise), 0) as balance_paise,
  case
    when coalesce(sum(p.amount_paise), 0) >= i.total_paise then 'cleared'
    when coalesce(sum(p.amount_paise), 0) > 0 then 'part-paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    when i.due_date is not null then 'due'
    else i.status
  end as computed_status
from invoices i
left join payments p on p.invoice_id = i.id
group by i.id, i.total_paise, i.due_date, i.status;
