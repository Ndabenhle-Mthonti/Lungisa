-- Indexes for the screens in the product doc. Each one matches the filter that screen uses.

-- Landlord jobs table, status filter, and stats cards.
create index jobs_landlord_status_created_at_idx
  on jobs (landlord_id, status, created_at desc);

-- Tenant request list, newest first.
create index jobs_tenant_created_at_idx
  on jobs (tenant_id, created_at desc);

-- Provider "My Jobs Today". Done jobs are left out of the index.
create index jobs_provider_open_idx
  on jobs (provider_id, status)
  where status <> 'done';

-- Jobs for one flat, used on job details.
create index jobs_unit_id_idx
  on jobs (unit_id);

-- Status timeline for one job.
create index job_events_job_created_at_idx
  on job_events (job_id, created_at);

-- Tenants and providers that belong to one landlord.
create index profiles_landlord_role_idx
  on profiles (landlord_id, role);
