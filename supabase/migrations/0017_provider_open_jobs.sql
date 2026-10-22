-- My Jobs was asking for every open job, then sorting them.
-- Sipho has about 20,000 open jobs, so one page took several seconds and
-- the response stopped at 1,000 rows. This index matches the page order,
-- and the function returns the next 21 rows for the signed-in provider only.

create index if not exists jobs_provider_open_created_idx
  on jobs (provider_id, created_at, id)
  where status <> 'done';

create or replace function provider_open_jobs(
  cursor_created timestamptz,
  cursor_id uuid
)
returns table (
  id uuid,
  landlord_id uuid,
  category job_category,
  description text,
  status job_status,
  is_urgent boolean,
  photo_path text,
  created_at timestamptz,
  unit_label text,
  tenant_name text,
  tenant_phone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if app_role() is distinct from 'provider' then
    return;
  end if;

  return query
  select
    jobs.id,
    jobs.landlord_id,
    jobs.category,
    jobs.description,
    jobs.status,
    jobs.is_urgent,
    jobs.photo_path,
    jobs.created_at,
    units.label,
    profiles.full_name,
    profiles.phone
  from jobs
  join units on units.id = jobs.unit_id
  join profiles on profiles.id = jobs.tenant_id
  where jobs.provider_id = auth.uid()
    and jobs.status <> 'done'
    and (
      cursor_created is null
      or jobs.created_at > cursor_created
      or (jobs.created_at = cursor_created and jobs.id > cursor_id)
    )
  order by jobs.created_at asc, jobs.id asc
  limit 21;
end;
$$;

revoke all on function provider_open_jobs(timestamptz, uuid) from public, anon;
grant execute on function provider_open_jobs(timestamptz, uuid) to authenticated;

notify pgrst, 'reload schema';
