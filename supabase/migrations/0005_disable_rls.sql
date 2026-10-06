-- Row Level Security was turned on for these tables before any policies existed.
-- With no policy, every insert is rejected. Policies are added in a later migration.
-- Until then, keep RLS off so the seed script and the app can write rows.

alter table profiles disable row level security;
alter table properties disable row level security;
alter table units disable row level security;
alter table jobs disable row level security;
alter table job_events disable row level security;
alter table invites disable row level security;
