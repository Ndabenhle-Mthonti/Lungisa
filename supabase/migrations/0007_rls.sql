-- Row Level Security for every table.
-- 0004_grants.sql and 0005_disable_rls.sql already used the earlier numbers.
-- 0005 turned RLS off until these policies existed, so this file turns it back on.
-- There is no "allow all" policy. A role with no matching policy gets no rows.

-- Reads the caller's role without going through the profiles policies.
-- Policies that queried profiles directly would recurse.
create or replace function app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from profiles
  where id = auth.uid();
$$;

-- Landlord: his own id. Tenant or provider: the landlord_id on his profile.
create or replace function app_landlord_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when role = 'landlord' then id
    else landlord_id
  end
  from profiles
  where id = auth.uid();
$$;

-- The tenant's own flat. Needed on job insert so the policy does not read profiles.
create or replace function app_unit_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select unit_id
  from profiles
  where id = auth.uid();
$$;

-- True when the caller is the provider on a job for this tenant.
-- Security definer so the profiles policy does not recurse through jobs.
create or replace function provider_can_see_profile(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs
    where provider_id = auth.uid()
      and tenant_id = profile_id
  );
$$;

revoke all on function app_role() from public;
revoke all on function app_landlord_id() from public;
revoke all on function app_unit_id() from public;
revoke all on function provider_can_see_profile(uuid) from public;

grant execute on function app_role() to authenticated;
grant execute on function app_landlord_id() to authenticated;
grant execute on function app_unit_id() to authenticated;
grant execute on function provider_can_see_profile(uuid) to authenticated;

-- RLS cannot limit which columns an update touches. This trigger does.
-- A landlord may only set the provider while moving pending -> assigned.
-- A provider may only change status and proof_photo_path.
-- The trigger still fills assigned_at, on_the_way_at and completed_at itself.
create or replace function enforce_job_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller_role user_role;
begin
  caller_role := app_role();

  if caller_role = 'landlord' then
    if old.landlord_id is distinct from auth.uid() then
      raise exception 'You can only update your own jobs.';
    end if;

    if new.id is distinct from old.id
      or new.landlord_id is distinct from old.landlord_id
      or new.unit_id is distinct from old.unit_id
      or new.tenant_id is distinct from old.tenant_id
      or new.category is distinct from old.category
      or new.description is distinct from old.description
      or new.photo_path is distinct from old.photo_path
      or new.proof_photo_path is distinct from old.proof_photo_path
      or new.created_at is distinct from old.created_at
      or new.assigned_at is distinct from old.assigned_at
      or new.on_the_way_at is distinct from old.on_the_way_at
      or new.completed_at is distinct from old.completed_at
      or new.is_urgent is distinct from old.is_urgent
      or new.reopen_count is distinct from old.reopen_count
      or new.reopen_note is distinct from old.reopen_note
      or new.reopened_at is distinct from old.reopened_at
    then
      raise exception 'A landlord can only set the provider and move the job from pending to assigned.';
    end if;

    if old.status = new.status
      and new.provider_id is not distinct from old.provider_id
    then
      return new;
    end if;

    if old.status = 'pending' and new.status = 'assigned' then
      if new.provider_id is null then
        raise exception 'Choose a provider before assigning this job.';
      end if;

      if not exists (
        select 1
        from profiles
        where id = new.provider_id
          and role = 'provider'
          and landlord_id = old.landlord_id
      ) then
        raise exception 'Choose one of your own providers.';
      end if;

      new.assigned_at := now();
      return new;
    end if;

    raise exception 'A landlord can only move a job from pending to assigned.';
  end if;

  if caller_role = 'provider' then
    if old.provider_id is distinct from auth.uid() then
      raise exception 'You can only update jobs assigned to you.';
    end if;

    if new.id is distinct from old.id
      or new.landlord_id is distinct from old.landlord_id
      or new.unit_id is distinct from old.unit_id
      or new.tenant_id is distinct from old.tenant_id
      or new.provider_id is distinct from old.provider_id
      or new.category is distinct from old.category
      or new.description is distinct from old.description
      or new.photo_path is distinct from old.photo_path
      or new.created_at is distinct from old.created_at
      or new.assigned_at is distinct from old.assigned_at
      or new.on_the_way_at is distinct from old.on_the_way_at
      or new.completed_at is distinct from old.completed_at
      or new.is_urgent is distinct from old.is_urgent
      or new.reopen_count is distinct from old.reopen_count
      or new.reopen_note is distinct from old.reopen_note
      or new.reopened_at is distinct from old.reopened_at
    then
      raise exception 'A provider can only change the status and the proof photo.';
    end if;

    if old.status = new.status then
      return new;
    end if;

    if old.status = 'assigned' and new.status = 'on_the_way' then
      new.on_the_way_at := now();
      return new;
    end if;

    if old.status = 'on_the_way' and new.status = 'done' then
      if new.proof_photo_path is null or new.proof_photo_path = '' then
        raise exception 'Add a proof photo before marking this job done.';
      end if;
      new.completed_at := now();
      return new;
    end if;

    raise exception 'Cannot change status from % to %.', old.status, new.status;
  end if;

  raise exception 'Only the landlord or the assigned provider can update a job.';
end;
$$;

alter table properties enable row level security;
alter table units enable row level security;
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table job_events enable row level security;
alter table invites enable row level security;

-- Safe to run again. A second paste would stop on the first policy that already exists.
drop policy if exists jobs_select_landlord on jobs;
drop policy if exists jobs_select_tenant on jobs;
drop policy if exists jobs_select_provider on jobs;
drop policy if exists jobs_insert_tenant on jobs;
drop policy if exists jobs_update_landlord on jobs;
drop policy if exists jobs_update_provider on jobs;
drop policy if exists profiles_select on profiles;
drop policy if exists properties_landlord_all on properties;
drop policy if exists units_landlord_all on units;
drop policy if exists units_select_tenant on units;
drop policy if exists job_events_select on job_events;
drop policy if exists invites_landlord_all on invites;

-- Jobs: each role reads only the rows that name them.
create policy jobs_select_landlord
  on jobs
  for select
  to authenticated
  using (app_role() = 'landlord' and landlord_id = auth.uid());

create policy jobs_select_tenant
  on jobs
  for select
  to authenticated
  using (app_role() = 'tenant' and tenant_id = auth.uid());

create policy jobs_select_provider
  on jobs
  for select
  to authenticated
  using (app_role() = 'provider' and provider_id = auth.uid());

-- Tenants create a pending report for their own flat. No provider yet.
create policy jobs_insert_tenant
  on jobs
  for insert
  to authenticated
  with check (
    app_role() = 'tenant'
    and tenant_id = auth.uid()
    and unit_id = app_unit_id()
    and landlord_id = app_landlord_id()
    and status = 'pending'
    and provider_id is null
    and photo_path <> ''
  );

create policy jobs_update_landlord
  on jobs
  for update
  to authenticated
  using (app_role() = 'landlord' and landlord_id = auth.uid())
  with check (app_role() = 'landlord' and landlord_id = auth.uid());

create policy jobs_update_provider
  on jobs
  for update
  to authenticated
  using (app_role() = 'provider' and provider_id = auth.uid())
  with check (app_role() = 'provider' and provider_id = auth.uid());

-- Profiles: own row, the landlord's people, and the tenant on a provider's job.
create policy profiles_select
  on profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or (app_role() = 'landlord' and landlord_id = auth.uid())
    or (app_role() = 'provider' and provider_can_see_profile(id))
  );

-- Landlord manages his buildings. A tenant can read only his own flat.
create policy properties_landlord_all
  on properties
  for all
  to authenticated
  using (app_role() = 'landlord' and landlord_id = auth.uid())
  with check (app_role() = 'landlord' and landlord_id = auth.uid());

create policy units_landlord_all
  on units
  for all
  to authenticated
  using (app_role() = 'landlord' and landlord_id = auth.uid())
  with check (app_role() = 'landlord' and landlord_id = auth.uid());

create policy units_select_tenant
  on units
  for select
  to authenticated
  using (app_role() = 'tenant' and id = app_unit_id());

-- History follows the job. If you cannot read the job, you cannot read its events.
create policy job_events_select
  on job_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from jobs
      where jobs.id = job_events.job_id
    )
  );

-- Invitations belong to the landlord who sends them.
create policy invites_landlord_all
  on invites
  for all
  to authenticated
  using (app_role() = 'landlord' and landlord_id = auth.uid())
  with check (app_role() = 'landlord' and landlord_id = auth.uid());
