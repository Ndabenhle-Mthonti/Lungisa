-- The dashboard cards were counting every job on each page load.
-- At 100,000 jobs that took about 8 seconds. These tables keep the three counts,
-- and a trigger updates them when a job is created, changed, or deleted.
-- landlord_stats reads the saved counts for the signed-in landlord only.

create table landlord_job_counts (
  landlord_id uuid primary key references profiles (id) on delete cascade,
  pending_count integer not null default 0,
  in_progress_count integer not null default 0
);

create table landlord_done_months (
  landlord_id uuid not null references profiles (id) on delete cascade,
  month timestamptz not null,
  done_count integer not null default 0,
  primary key (landlord_id, month)
);

alter table landlord_job_counts enable row level security;
alter table landlord_done_months enable row level security;

revoke all on landlord_job_counts from public, anon, authenticated;
revoke all on landlord_done_months from public, anon, authenticated;

-- p_delta is 1 when a job enters a bucket and -1 when it leaves.
create or replace function apply_landlord_job_count(
  p_landlord uuid,
  p_status job_status,
  p_completed timestamptz,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into landlord_job_counts (landlord_id, pending_count, in_progress_count)
  values (
    p_landlord,
    case when p_status = 'pending' then p_delta else 0 end,
    case when p_status in ('assigned', 'on_the_way') then p_delta else 0 end
  )
  on conflict (landlord_id) do update
  set pending_count = landlord_job_counts.pending_count + excluded.pending_count,
      in_progress_count = landlord_job_counts.in_progress_count + excluded.in_progress_count;

  if p_status = 'done' and p_completed is not null then
    insert into landlord_done_months (landlord_id, month, done_count)
    values (p_landlord, date_trunc('month', p_completed), p_delta)
    on conflict (landlord_id, month) do update
    set done_count = landlord_done_months.done_count + excluded.done_count;
  end if;
end;
$$;

create or replace function maintain_landlord_job_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform apply_landlord_job_count(new.landlord_id, new.status, new.completed_at, 1);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform apply_landlord_job_count(old.landlord_id, old.status, old.completed_at, -1);
    return old;
  end if;

  if old.landlord_id is distinct from new.landlord_id
    or old.status is distinct from new.status
    or old.completed_at is distinct from new.completed_at
  then
    perform apply_landlord_job_count(old.landlord_id, old.status, old.completed_at, -1);
    perform apply_landlord_job_count(new.landlord_id, new.status, new.completed_at, 1);
  end if;

  return new;
end;
$$;

revoke all on function apply_landlord_job_count(uuid, job_status, timestamptz, integer) from public, anon, authenticated;
revoke all on function maintain_landlord_job_counts() from public, anon;

grant execute on function maintain_landlord_job_counts() to authenticated, service_role;

-- Block job writes, copy the current totals, then turn the trigger on before those writes can resume.
lock table jobs in share row exclusive mode;

insert into landlord_job_counts (landlord_id, pending_count, in_progress_count)
select
  landlord_id,
  count(*) filter (where status = 'pending'),
  count(*) filter (where status in ('assigned', 'on_the_way'))
from jobs
group by landlord_id;

insert into landlord_done_months (landlord_id, month, done_count)
select
  landlord_id,
  date_trunc('month', completed_at),
  count(*)
from jobs
where status = 'done'
  and completed_at is not null
group by landlord_id, date_trunc('month', completed_at);

drop trigger if exists jobs_maintain_landlord_counts on jobs;

create trigger jobs_maintain_landlord_counts
  after insert or update or delete on jobs
  for each row
  execute function maintain_landlord_job_counts();

create or replace function landlord_stats()
returns table (
  new_jobs bigint,
  in_progress bigint,
  done_this_month bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if app_role() is distinct from 'landlord' then
    return query select 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  return query
  select
    coalesce(counts.pending_count, 0)::bigint,
    coalesce(counts.in_progress_count, 0)::bigint,
    coalesce(done_month.done_count, 0)::bigint
  from (select auth.uid() as landlord_id) as caller
  left join landlord_job_counts as counts
    on counts.landlord_id = caller.landlord_id
  left join landlord_done_months as done_month
    on done_month.landlord_id = caller.landlord_id
   and done_month.month = date_trunc('month', now());
end;
$$;

revoke all on function landlord_stats() from public, anon;
grant execute on function landlord_stats() to authenticated;

notify pgrst, 'reload schema';
