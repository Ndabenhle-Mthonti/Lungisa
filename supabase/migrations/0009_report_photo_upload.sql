-- The report screen uploads the photo before it inserts the job.
-- Replace the tenant upload rule so that order is allowed.
-- Run this once in the Supabase SQL editor if 0008 was applied earlier.

drop policy if exists job_photos_tenant_insert on storage.objects;

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
