-- Private photo buckets.
-- 0005_disable_rls.sql already used the 0005 number, so this file is 0008.
-- Run 0007_rls.sql first. These policies call public.app_role() and public.app_landlord_id().
-- No update or delete policy exists, so nobody can overwrite or remove a file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('job-photos', 'job-photos', false, 5242880, array['image/jpeg', 'image/png']),
  ('proof-photos', 'proof-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has row level security on.
-- The SQL editor cannot alter that table (it is owned by Supabase), so this file only adds policies.
-- public.app_role() is written in full so the storage schema can find the function.

drop policy if exists job_photos_tenant_insert on storage.objects;
drop policy if exists job_photos_tenant_select on storage.objects;
drop policy if exists photos_landlord_select on storage.objects;
drop policy if exists job_photos_provider_select on storage.objects;
drop policy if exists proof_photos_provider_insert on storage.objects;

-- Tenant: upload the report before the job row exists.
-- The app creates the job id first, then stores landlordId/jobId/report.jpg.
-- The first folder must be his own landlord, and the file name must be report.jpg.
create policy job_photos_tenant_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and (select public.app_role()) = 'tenant'
    and name = (select public.app_landlord_id())::text
      || '/'
      || (storage.foldername(name))[2]
      || '/report.jpg'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- Tenant: read that same report. Proof photos are not included.
create policy job_photos_tenant_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (select public.app_role()) = 'tenant'
    and exists (
      select 1
      from jobs
      where jobs.tenant_id = auth.uid()
        and jobs.landlord_id = (select public.app_landlord_id())
        and name = jobs.landlord_id::text || '/' || jobs.id::text || '/report.jpg'
    )
  );

-- Landlord: read reports and proof photos stored under his own folder.
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
        and name = jobs.landlord_id::text || '/' || jobs.id::text || '/' || case
          when bucket_id = 'job-photos' then 'report.jpg'
          else 'proof.jpg'
        end
    )
  );

-- Provider: read the report photo on a job assigned to him.
create policy job_photos_provider_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (select public.app_role()) = 'provider'
    and exists (
      select 1
      from jobs
      where jobs.provider_id = auth.uid()
        and jobs.landlord_id = (select public.app_landlord_id())
        and name = jobs.landlord_id::text || '/' || jobs.id::text || '/report.jpg'
    )
  );

-- Provider: upload proof for a job assigned to him. He cannot replace it later.
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
        and name = jobs.landlord_id::text || '/' || jobs.id::text || '/proof.jpg'
    )
  );
