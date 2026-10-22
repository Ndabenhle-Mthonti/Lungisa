-- First login asks the person to read the privacy notice.
-- privacy_accepted_at stays empty until they accept.
-- A person may set only their own timestamp. Every other profile column stays as it is.
-- The service role can still update a whole row, which the seed script needs.

alter table profiles
  add column if not exists privacy_accepted_at timestamptz;

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

drop trigger if exists profiles_protect_update on profiles;

create trigger profiles_protect_update
  before update on profiles
  for each row
  execute function protect_profile_update();

drop policy if exists profiles_update_own on profiles;

create policy profiles_update_own
  on profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

notify pgrst, 'reload schema';
