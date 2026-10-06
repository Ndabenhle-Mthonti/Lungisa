-- The tables exist, but the seed script cannot touch them until these roles are allowed.
-- anon is left out on purpose. Row Level Security is still added later.
-- service_role is the seed script. authenticated is a signed-in landlord, tenant, or provider.

grant select, insert, update, delete on
  profiles,
  properties,
  units,
  jobs,
  job_events,
  invites
to service_role, authenticated;
