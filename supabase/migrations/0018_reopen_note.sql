-- Sending a job back must include a new note.
-- An update that only changes the status keeps the old note, and the previous
-- check treated that stored note as good enough. The note in this update has
-- to be different from the one already saved.

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
          and landlord_id = auth.uid()
      ) then
        raise exception 'Choose one of your own providers.';
      end if;

      new.assigned_at := now();
      return new;
    end if;

    -- Same status, different provider. Only while the provider has not started.
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

  -- One extra move: done -> assigned, and only for the tenant on that job.
  -- The caller supplies a new note. Leaving the old note in place is rejected.
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
