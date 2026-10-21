-- A provider may read the flat label for an open job assigned to them.
-- Other flats, buildings, and rent stay hidden.

drop policy if exists units_select_provider on units;

create policy units_select_provider
  on units
  for select
  to authenticated
  using (
    app_role() = 'provider'
    and exists (
      select 1
      from jobs
      where jobs.unit_id = units.id
        and jobs.provider_id = auth.uid()
        and jobs.status <> 'done'
    )
  );
