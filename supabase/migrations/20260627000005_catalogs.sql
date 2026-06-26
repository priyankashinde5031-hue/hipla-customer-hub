-- Settings / catalogs (spec §4 design principle #1: reference data is data,
-- not code). Seeded from Appendix A, editable in Settings later.

create table modules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_code text,
  description text,
  active boolean not null default true
);

create table entry_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table entry_source_module_map (
  entry_source_id uuid not null references entry_sources(id),
  module_id uuid not null references modules(id),
  primary key (entry_source_id, module_id)
);

create table hardware_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('Tablet', 'Mount', 'Accessory')),
  active boolean not null default true
);

create table cost_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table po_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table ticket_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table term_lengths (
  id uuid primary key default gen_random_uuid(),
  label text not null unique, -- e.g. '1 year', '3 years'
  months integer not null check (months > 0),
  active boolean not null default true
);
