import { compressPhoto, proofPhotoPath, uploadPhoto } from '../../lib/photos.js'
import { supabase } from '../../lib/supabaseClient.js'

const PAGE_SIZE = 20

// Open jobs for the signed-in provider only. Oldest first, 20 at a time.
// provider_open_jobs reads the next page directly. Asking the jobs table for
// every open row made Postgres walk thousands of jobs before it could return 20.
export async function fetchProviderJobs(cursor) {
  const { data: sessionData } = await supabase.auth.getSession()
  const providerId = sessionData.session?.user?.id
  if (!providerId) throw new Error('Please sign in again.')

  const { data, error } = await supabase.rpc('provider_open_jobs', {
    cursor_created: cursor?.createdAt ?? null,
    cursor_id: cursor?.id ?? null,
  })
  if (error) throw new Error('Jobs could not be loaded. Please try again.')

  const page = (data ?? []).slice(0, PAGE_SIZE).map(mapJob)
  const last = page[page.length - 1]
  const hasMore = (data ?? []).length > PAGE_SIZE
  return {
    rows: page,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}

function mapJob(row) {
  return {
    id: row.id,
    landlordId: row.landlord_id,
    category: row.category,
    description: row.description ?? '',
    status: row.status,
    urgent: row.is_urgent === true,
    photoPath: row.photo_path ?? '',
    createdAt: row.created_at,
    unitLabel: row.unit_label ?? '',
    tenantName: row.tenant_name ?? '',
    tenantPhone: row.tenant_phone ?? '',
  }
}

// The update matched nothing because the job was no longer assigned.
export class JobAlreadyStartedError extends Error {
  constructor() {
    super('This job already changed. Refresh to see it.')
    this.name = 'JobAlreadyStartedError'
  }
}

// Moves an assigned job to on the way. A second tap, or another tab, changes no row.
export async function markOnTheWay({ jobId }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const providerId = sessionData.session?.user?.id
  if (!providerId) throw new Error('Please sign in again.')

  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'on_the_way' })
    .eq('id', jobId)
    .eq('provider_id', providerId)
    .eq('status', 'assigned')
    .select('id')

  if (error) throw new Error('This job could not be updated. Please try again.')
  if (data?.length !== 1) throw new JobAlreadyStartedError()
  return data[0]
}

// The update matched nothing because the job was no longer on the way.
export class JobChangedError extends Error {
  constructor() {
    super('This job already changed. Refresh to see it.')
    this.name = 'JobChangedError'
  }
}

// Stores the proof photo first. The job becomes done only after that file is saved,
// and only while the row is still on the way.
export async function markDone({ jobId, landlordId, photo, preview }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const providerId = sessionData.session?.user?.id
  if (!providerId) throw new Error('Please sign in again.')
  if (!photo) throw new Error('Add a proof photo before marking this job done.')

  const file = await compressPhoto(photo, preview)
  const path = proofPhotoPath(landlordId, jobId)
  let storedPath = ''
  try {
    await uploadPhoto({ bucket: 'proof-photos', path, file })
    storedPath = path
  } catch (error) {
    const uploadError = error instanceof Error ? error : new Error('The photo could not be uploaded. Please try again.')
    uploadError.uploaded = false
    throw uploadError
  }
  if (!storedPath) throw new Error('The photo could not be uploaded. Please try again.')

  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'done', proof_photo_path: storedPath })
    .eq('id', jobId)
    .eq('provider_id', providerId)
    .eq('status', 'on_the_way')
    .select('id')

  if (error) throw new Error('This job could not be updated. Please try again.')
  if (data?.length !== 1) throw new JobChangedError()
  return data[0]
}
