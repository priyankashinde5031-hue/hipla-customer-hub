-- Let a manually-set invoice status (draft / cancelled) stick instead of being
-- overridden by the auto-aging. Previously invoice_balances always computed
-- due/overdue/part-paid/cleared from payments + due date, so marking an invoice
-- "cancelled" had no visible effect. Now those two terminal/manual states
-- short-circuit; everything else is still derived (money is computed, not
-- hand-totaled — spec §4/§12).
create or replace view invoice_balances as
select
  i.id as invoice_id,
  i.total_paise,
  coalesce(sum(p.amount_paise), 0) as paid_paise,
  i.total_paise - coalesce(sum(p.amount_paise), 0) as balance_paise,
  case
    when i.status in ('cancelled', 'draft') then i.status
    when coalesce(sum(p.amount_paise), 0) >= i.total_paise then 'cleared'
    when coalesce(sum(p.amount_paise), 0) > 0 then 'part-paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    when i.due_date is not null then 'due'
    else i.status
  end as computed_status
from invoices i
left join payments p on p.invoice_id = i.id
group by i.id, i.total_paise, i.due_date, i.status;
