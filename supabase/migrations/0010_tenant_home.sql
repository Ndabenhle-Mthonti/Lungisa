-- Live updates for the tenant home list, and proof photos the tenant may open.
-- Run this once in the Supabase SQL editor.

alter table jobs replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table jobs;
  end if;
end $$;

drop policy if exists proof_photos_tenant_select on storage.objects;

-- A tenant may read the proof photo on their own finished job.
create policy proof_photos_tenant_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'proof-photos'
    and (select public.app_role()) = 'tenant'
    and exists (
      select 1
      from jobs
      where jobs.tenant_id = auth.uid()
        and jobs.status = 'done'
        and jobs.proof_photo_path = name
    )
  );
