-- The invite function counts a landlord's invites from the last hour.
-- Run this once before deploying supabase/functions/invite-user.

alter table invites
  add column if not exists created_at timestamptz not null default now();

create index if not exists invites_landlord_created_at_idx
  on invites (landlord_id, created_at desc);
