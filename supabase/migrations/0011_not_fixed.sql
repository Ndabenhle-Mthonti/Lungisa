-- "Not fixed": the tenant who owns a finished job may send it back to the same provider.
-- Run this once after 0007_rls.sql and 0008_storage.sql.
-- Landlord and provider status rules are unchanged.

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

  -- One extra move: done -> assigned, and only for the tenant on that job.
  -- The caller may change the status and supply a note. The trigger itself
  -- counts the reopen, stamps the time, and clears the proof path so the
  -- provider has to upload a new photo. The history row keeps the old path.
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
      if new.reopen_note is null or btrim(new.reopen_note) = '' then
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

-- The status history row already records done -> assigned. On that move, keep
-- the proof path that the trigger is about to clear.
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

drop policy if exists jobs_update_tenant on jobs;

-- The tenant can update only his own finished job, and only into assigned with a note.
-- Which other columns may change is enforced by the trigger above.
create policy jobs_update_tenant
  on jobs
  for update
  to authenticated
  using (
    (select public.app_role()) = 'tenant'
    and tenant_id = auth.uid()
    and status = 'done'
  )
  with check (
    (select public.app_role()) = 'tenant'
    and tenant_id = auth.uid()
    and status = 'assigned'
    and reopen_note is not null
    and btrim(reopen_note) <> ''
  );

-- Proof files are proof-<timestamp>.jpg so a second photo does not overwrite the first.
-- 0008 required the exact name proof.jpg. Reading still allows that older name.
-- The tenant proof policy in 0010 matches jobs.proof_photo_path, so it already
-- accepts whatever path is stored on the job.

drop policy if exists photos_landlord_select on storage.objects;
drop policy if exists proof_photos_provider_insert on storage.objects;

create policy photos_landlord_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('job-photos', 'proof-photos')
    and (select public.app_role()) = 'landlord'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from jobs
      where jobs.landlord_id = auth.uid()
        and (
          (
            bucket_id = 'job-photos'
            and name = jobs.landlord_id::text || '/' || jobs.id::text || '/report.jpg'
          )
          or (
            bucket_id = 'proof-photos'
            and (
              name = jobs.landlord_id::text || '/' || jobs.id::text || '/proof.jpg'
              or name ~ (
                '^' || jobs.landlord_id::text || '/' || jobs.id::text || '/proof-[0-9]+\.jpg$'
              )
            )
          )
        )
    )
  );

create policy proof_photos_provider_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'proof-photos'
    and (select public.app_role()) = 'provider'
    and exists (
      select 1
      from jobs
      where jobs.provider_id = auth.uid()
        and jobs.landlord_id = (select public.app_landlord_id())
        and name ~ (
          '^' || jobs.landlord_id::text || '/' || jobs.id::text || '/proof-[0-9]+\.jpg$'
        )
    )
  );
