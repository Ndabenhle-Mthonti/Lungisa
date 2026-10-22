-- Bulk insert for the development load test.
-- The history trigger requires auth.uid(), and the service role key has no user id,
-- so a normal insert from scripts/seed-load.mjs is rejected.
-- This function skips that one trigger for a single batch. It accepts only rows
-- whose description starts with LOAD-TEST, and only when the caller is the service role.
-- The disable is transactional: a failed batch rolls it back and the trigger stays on.

create or replace function insert_load_test_jobs(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  bad integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
    and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role'
  then
    raise exception 'Only the service role can insert load-test jobs.';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'Pass a non-empty array of jobs.';
  end if;

  if jsonb_array_length(payload) > 1000 then
    raise exception 'Insert at most 1000 jobs at a time.';
  end if;

  select count(*)
  into bad
  from jsonb_array_elements(payload) as item
  where coalesce(item ->> 'description', '') not like 'LOAD-TEST%';

  if bad > 0 then
    raise exception 'Every load-test description must start with LOAD-TEST.';
  end if;

  select count(*)
  into bad
  from jsonb_array_elements(payload) as item
  where (item ->> 'status' = 'pending' and nullif(item ->> 'provider_id', '') is not null)
    or (item ->> 'status' is distinct from 'pending' and nullif(item ->> 'provider_id', '') is null)
    or (item ->> 'status' = 'done' and nullif(item ->> 'proof_photo_path', '') is null)
    or (item ->> 'status' is distinct from 'done' and nullif(item ->> 'proof_photo_path', '') is not null)
    or nullif(item ->> 'photo_path', '') is null
    or nullif(item ->> 'created_at', '') is null;

  if bad > 0 then
    raise exception 'Load-test rows must follow the status rules.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload) as item
    join profiles as tenant on tenant.id = (item ->> 'tenant_id')::uuid
    join units as unit on unit.id = (item ->> 'unit_id')::uuid
    where tenant.role is distinct from 'tenant'
      or tenant.landlord_id is distinct from (item ->> 'landlord_id')::uuid
      or unit.landlord_id is distinct from (item ->> 'landlord_id')::uuid
      or tenant.unit_id is distinct from unit.id
      or (
        nullif(item ->> 'provider_id', '') is not null
        and not exists (
          select 1
          from profiles as provider
          where provider.id = (item ->> 'provider_id')::uuid
            and provider.role = 'provider'
            and provider.landlord_id = (item ->> 'landlord_id')::uuid
        )
      )
  ) then
    raise exception 'Each job must belong to one landlord, that landlord''s unit, the tenant who lives there, and one of that landlord''s providers.';
  end if;

  lock table jobs in share row exclusive mode;
  alter table jobs disable trigger jobs_log_status_event;

  insert into jobs (
    landlord_id,
    unit_id,
    tenant_id,
    provider_id,
    category,
    description,
    photo_path,
    proof_photo_path,
    status,
    is_urgent,
    created_at,
    assigned_at,
    on_the_way_at,
    completed_at
  )
  select
    (item ->> 'landlord_id')::uuid,
    (item ->> 'unit_id')::uuid,
    (item ->> 'tenant_id')::uuid,
    nullif(item ->> 'provider_id', '')::uuid,
    (item ->> 'category')::job_category,
    item ->> 'description',
    item ->> 'photo_path',
    nullif(item ->> 'proof_photo_path', ''),
    (item ->> 'status')::job_status,
    coalesce((item ->> 'is_urgent')::boolean, false),
    (item ->> 'created_at')::timestamptz,
    nullif(item ->> 'assigned_at', '')::timestamptz,
    nullif(item ->> 'on_the_way_at', '')::timestamptz,
    nullif(item ->> 'completed_at', '')::timestamptz
  from jsonb_array_elements(payload) as item;

  get diagnostics inserted = row_count;

  alter table jobs enable trigger jobs_log_status_event;
  return inserted;
exception
  when others then
    begin
      alter table jobs enable trigger jobs_log_status_event;
    exception
      when others then
        null;
    end;
    raise;
end;
$$;

revoke all on function insert_load_test_jobs(jsonb) from public;
revoke all on function insert_load_test_jobs(jsonb) from anon;
revoke all on function insert_load_test_jobs(jsonb) from authenticated;
grant execute on function insert_load_test_jobs(jsonb) to service_role;

-- Deletes one batch of LOAD-TEST jobs and their history.
-- Doing this in SQL avoids putting thousands of ids into the request URL.
create or replace function delete_load_test_jobs(batch_size integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  removed integer := 0;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
    and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role'
  then
    raise exception 'Only the service role can delete load-test jobs.';
  end if;

  if batch_size < 1 or batch_size > 1000 then
    raise exception 'Delete at most 1000 jobs at a time.';
  end if;

  select array_agg(id)
  into ids
  from (
    select id
    from jobs
    where description like 'LOAD-TEST%'
    limit batch_size
  ) as batch;

  if ids is null then
    return 0;
  end if;

  delete from job_events
  where job_id = any(ids);

  delete from jobs
  where id = any(ids)
    and description like 'LOAD-TEST%';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function delete_load_test_jobs(integer) from public;
revoke all on function delete_load_test_jobs(integer) from anon;
revoke all on function delete_load_test_jobs(integer) from authenticated;
grant execute on function delete_load_test_jobs(integer) to service_role;

notify pgrst, 'reload schema';
