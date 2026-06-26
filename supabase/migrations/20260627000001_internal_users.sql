-- Internal Hipla staff accounts. No customer login in v1 (spec §9).
create extension if not exists pgcrypto;

create table internal_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique, -- links to Supabase Auth's auth.users.id once auth is wired up
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'manager', 'cs_onboarding', 'read_only')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table internal_users is 'Hipla staff who can log in. Role drives permissions (spec §9).';
