-- Status rules and landlord counts.
-- Row Level Security is still off. These rules run even if the app is bypassed.

-- proof_photo_path can stay empty until the job is finished, but a blank string is not a photo.
alter table jobs
  add constraint jobs_proof_photo_path_not_empty
  check (proof_photo_path is null or proof_photo_path <> '');

-- Blocks skipped or backwards status moves, and fills in the time of each step.
create or replace function enforce_job_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- An edit that does not change status (for example a new description) is allowed.
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'pending' and new.status = 'assigned' then
    if new.provider_id is null then
      raise exception 'Choose a provider before assigning this job.';
    end if;
    new.assigned_at := now();

  elsif old.status = 'assigned' and new.status = 'on_the_way' then
    new.on_the_way_at := now();

  elsif old.status = 'on_the_way' and new.status = 'done' then
    if new.proof_photo_path is null or new.proof_photo_path = '' then
      raise exception 'Add a proof photo before marking this job done.';
    end if;
    new.completed_at := now();

  else
    raise exception 'Cannot change status from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger jobs_enforce_status_change
  before update on jobs
  for each row
  execute function enforce_job_status_change();

-- Writes the history row. security definer lets this insert succeed after RLS is turned on,
-- while auth.uid() still means the person who made the request.
create or replace function log_job_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'You must be logged in to create or update a job.';
  end if;

  insert into job_events (job_id, from_status, to_status, actor_id)
  values (
    new.id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    auth.uid()
  );

  return new;
end;
$$;

create trigger jobs_log_status_event
  after insert or update of status on jobs
  for each row
  execute function log_job_status_event();

-- One row of counts for the landlord who is logged in. The dashboard does not download every job.
create or replace function landlord_stats()
returns table (
  new_jobs bigint,
  in_progress bigint,
  done_this_month bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where status = 'pending') as new_jobs,
    count(*) filter (where status in ('assigned', 'on_the_way')) as in_progress,
    count(*) filter (
      where status = 'done'
        and completed_at >= date_trunc('month', now())
    ) as done_this_month
  from jobs
  where landlord_id = auth.uid();
$$;
