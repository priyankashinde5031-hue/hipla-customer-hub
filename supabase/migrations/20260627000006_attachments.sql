-- File metadata only. The actual file bytes live in Supabase Storage, never
-- in the database (spec §4, §12).
create table attachments (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  uploaded_by uuid references internal_users(id),
  created_at timestamptz not null default now()
);
