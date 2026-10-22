-- A landlord can correct a tenant or provider, and can remove them when they leave.
-- The flat is then free for the next person. Finished and open jobs stay.
-- Their login is deleted, so the name, phone, and email go with it.

alter table profiles
  add column if not exists email text;

update profiles
set email = auth.users.email
from auth.users
where profiles.id = auth.users.id
  and profiles.email is null;

-- A person may still only accept the privacy notice. Email is not theirs to change.
create or replace function protect_profile_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.full_name is distinct from old.full_name
    or new.phone is distinct from old.phone
    or new.email is distinct from old.email
    or new.landlord_id is distinct from old.landlord_id
    or new.unit_id is distinct from old.unit_id
    or new.trade is distinct from old.trade
  then
    raise exception 'You can only record that you have read the privacy notice.';
  end if;

  if new.privacy_accepted_at is null then
    raise exception 'The privacy notice stays accepted.';
  end if;

  return new;
end;
$$;

-- Deleting the login clears these ids. The job row itself stays.
alter table jobs alter column tenant_id drop not null;

alter table jobs drop constraint if exists jobs_tenant_id_fkey;
alter table jobs
  add constraint jobs_tenant_id_fkey
  foreign key (tenant_id) references profiles (id) on delete set null;

alter table jobs drop constraint if exists jobs_provider_id_fkey;
alter table jobs
  add constraint jobs_provider_id_fkey
  foreign key (provider_id) references profiles (id) on delete set null;

alter table job_events alter column actor_id drop not null;

alter table job_events drop constraint if exists job_events_actor_id_fkey;
alter table job_events
  add constraint job_events_actor_id_fkey
  foreign key (actor_id) references profiles (id) on delete set null;

-- The remove function sets this for its own transaction only.
-- A normal update still has to follow the status rules.
create or replace function enforce_job_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller_role user_role;
begin
  if current_setting('lungisa.removing_person', true) = '1' then
    return new;
  end if;

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
          and landlord_id = auth.uid()
      ) then
        raise exception 'Choose one of your own providers.';
      end if;

      new.assigned_at := now();
      return new;
    end if;

    if old.status = 'assigned' and new.status = 'assigned' then
      if new.provider_id is null then
        raise exception 'Choose a provider before assigning this job.';
      end if;

      if not exists (
        select 1
        from profiles
        where id = new.provider_id
          and role = 'provider'
          and landlord_id = auth.uid()
      ) then
        raise exception 'Choose one of your own providers.';
      end if;

      return new;
    end if;

    if new.provider_id is distinct from old.provider_id then
      raise exception 'You can only change the provider while the job is assigned.';
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

  if caller_role = 'tenant' then
    if old.tenant_id is distinct from auth.uid() then
      raise exception 'You can only update your own jobs.';
    end if;

    if new.id is distinct from old.id
      or new.landlord_id is distinct from old.landlord_id
      or new.unit_id is distinct from old.unit_id
      or new.tenant_id is distinct from old.tenant_id
      or new.provider_id is distinct from old.provider_id
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
      or new.reopened_at is distinct from old.reopened_at
    then
      raise exception 'You can only send a finished job back with a note.';
    end if;

    if old.status = 'done' and new.status = 'assigned' then
      if new.reopen_note is null
        or btrim(new.reopen_note) = ''
        or btrim(new.reopen_note) is not distinct from old.reopen_note
      then
        raise exception 'Add a note before sending this job back.';
      end if;

      new.reopen_note := btrim(new.reopen_note);
      new.reopen_count := old.reopen_count + 1;
      new.reopened_at := now();
      new.proof_photo_path := null;
      return new;
    end if;

    raise exception 'You can only send a finished job back to the provider.';
  end if;

  raise exception 'Only the landlord or the assigned provider can update a job.';
end;
$$;

create or replace function log_job_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_name text;
  new_name text;
begin
  if current_setting('lungisa.removing_person', true) = '1' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = new.status
    and new.provider_id is not distinct from old.provider_id
  then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'You must be logged in to create or update a job.';
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'assigned'
    and new.status = 'assigned'
    and new.provider_id is distinct from old.provider_id
  then
    select full_name into old_name from profiles where id = old.provider_id;
    select full_name into new_name from profiles where id = new.provider_id;

    insert into job_events (job_id, from_status, to_status, actor_id, note)
    values (
      new.id,
      'assigned',
      'assigned',
      auth.uid(),
      'Reassigned from '
        || coalesce(nullif(btrim(old_name), ''), 'Unknown')
        || ' to '
        || coalesce(nullif(btrim(new_name), ''), 'Unknown')
    );

    return new;
  end if;

  insert into job_events (job_id, from_status, to_status, actor_id, note)
  values (
    new.id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    auth.uid(),
    case
      when tg_op = 'UPDATE' and old.status = 'done' and new.status = 'assigned'
        then 'Previous proof: ' || coalesce(old.proof_photo_path, '')
      else null
    end
  );

  return new;
end;
$$;

-- A provider still sees an open job after the tenant has been removed.
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
    coalesce(profiles.full_name, 'Former tenant'),
    coalesce(profiles.phone, '')
  from jobs
  join units on units.id = jobs.unit_id
  left join profiles on profiles.id = jobs.tenant_id
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

-- Removes one tenant or provider who belongs to the signed-in landlord.
-- Unfinished jobs that were assigned to a provider go back to pending.
create or replace function remove_landlord_person(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person_role user_role;
  person_landlord uuid;
begin
  if app_role() is distinct from 'landlord' then
    raise exception 'Only a landlord can remove someone.';
  end if;

  select role, landlord_id
    into person_role, person_landlord
  from profiles
  where id = p_person;

  if person_landlord is distinct from auth.uid()
    or person_role not in ('tenant', 'provider')
  then
    raise exception 'That person is not on your list.';
  end if;

  perform set_config('lungisa.removing_person', '1', true);

  update jobs
  set status = 'pending',
      provider_id = null,
      assigned_at = null,
      on_the_way_at = null
  where provider_id = p_person
    and status in ('assigned', 'on_the_way');

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name = 'owner'
  ) then
    execute 'update storage.objects set owner = null where owner = $1'
      using p_person;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name = 'owner_id'
  ) then
    execute 'update storage.objects set owner_id = null where owner_id = $1'
      using p_person;
  end if;

  delete from auth.users where id = p_person;
end;
$$;

revoke all on function remove_landlord_person(uuid) from public, anon;
grant execute on function remove_landlord_person(uuid) to authenticated;

notify pgrst, 'reload schema';
