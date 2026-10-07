-- Columns for Urgent and "Not fixed".
-- The status trigger is left as it is. Later migrations will allow reassign and reopen.

alter table jobs
  add column is_urgent boolean not null default false,
  add column reopen_count integer not null default 0,
  add column reopen_note text,
  add column reopened_at timestamptz;

alter table job_events
  add column note text;
