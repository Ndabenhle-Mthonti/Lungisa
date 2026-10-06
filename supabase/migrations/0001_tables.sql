-- Lungisa tables.
-- Row Level Security is left off on purpose. Policies are added in a later migration.
-- Foreign keys on jobs use ON DELETE RESTRICT so deleting a unit or a person cannot erase job history.

create type user_role as enum ('landlord', 'tenant', 'provider');

create type job_status as enum ('pending', 'assigned', 'on_the_way', 'done');

create type job_category as enum ('plumbing', 'electrical', 'lock', 'appliance', 'other');

-- One row per login. The id is the auth user id, so the role is not stored in browser-editable metadata.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  landlord_id uuid references profiles (id) on delete restrict,
  unit_id uuid,
  trade text
);

-- A building owned by one landlord.
create table properties (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references profiles (id) on delete restrict,
  name text not null,
  address text not null
);

-- A flat inside a building. landlord_id is stored on the row so checks do not join through the property.
create table units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete restrict,
  landlord_id uuid not null references profiles (id) on delete restrict,
  label text not null
);

-- Added after units exists. profiles.unit_id and units.landlord_id point at each other.
alter table profiles
  add constraint profiles_unit_id_fkey
  foreign key (unit_id) references units (id) on delete restrict;

-- A maintenance report. landlord_id is stored on the job so the dashboard can read it without a join.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references profiles (id) on delete restrict,
  unit_id uuid not null references units (id) on delete restrict,
  tenant_id uuid not null references profiles (id) on delete restrict,
  provider_id uuid references profiles (id) on delete restrict,
  category job_category not null,
  description text not null,
  photo_path text not null constraint jobs_photo_path_not_empty check (photo_path <> ''),
  proof_photo_path text,
  status job_status not null default 'pending',
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  on_the_way_at timestamptz,
  completed_at timestamptz
);

-- One row each time a job changes status.
create table job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete restrict,
  from_status job_status,
  to_status job_status not null,
  actor_id uuid not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- An email invitation that has not been accepted yet. used_at is filled when it is accepted.
create table invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role user_role not null,
  landlord_id uuid not null references profiles (id) on delete restrict,
  unit_id uuid references units (id) on delete restrict,
  trade text,
  used_at timestamptz
);
