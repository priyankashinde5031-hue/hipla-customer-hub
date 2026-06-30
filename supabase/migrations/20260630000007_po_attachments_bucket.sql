-- Storage bucket for Purchase Order files. The PO form can attach the customer's
-- PO document on create/edit; the path is recorded in `attachments` and linked
-- via purchase_orders.attachment_id (which already exists). Bytes never go in
-- the DB (CLAUDE.md). Private bucket, served via signed URLs — mirrors the
-- renewal-attachments setup (20260630000005).
insert into storage.buckets (id, name, public)
values ('po-attachments', 'po-attachments', false)
on conflict (id) do nothing;

create policy "po_attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'po-attachments' and is_active_internal_user());

create policy "po_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'po-attachments' and is_admin_or_manager());
