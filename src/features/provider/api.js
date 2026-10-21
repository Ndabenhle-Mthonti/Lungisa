import { compressPhoto, proofPhotoPath, uploadPhoto } from '../../lib/photos.js'
import { supabase } from '../../lib/supabaseClient.js'

// Open jobs for the signed-in provider only. Oldest first.
// Pending jobs have no provider, and Row Level Security hides every other row.
export async function fetchProviderJobs() {
  const { data: sessionData } = await supabase.auth.getSession()
  const providerId = sessionData.session?.user?.id
  if (!providerId) throw new Error('Please sign in again.')

  const { data, error } = await supabase
    .from('jobs')
    .select(
      [
        'id',
        'landlord_id',
        'category',
        'description',
        'status',
        'is_urgent',
        'photo_path',
        'created_at',
        'unit:units!jobs_unit_id_fkey(label)',
        'tenant:profiles!jobs_tenant_id_fkey(full_name, phone)',
      ].join(', '),
    )
    .eq('provider_id', providerId)
    .neq('status', 'done')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error('Jobs could not be loaded. Please try again.')

  return (data ?? []).map((row) => {
    const unit = first(row.unit)
    const tenant = first(row.tenant)
    return {
      id: row.id,
      landlordId: row.landlord_id,
      category: row.category,
      description: row.description ?? '',
      status: row.status,
      urgent: row.is_urgent === true,
      photoPath: row.photo_path ?? '',
      createdAt: row.created_at,
      unitLabel: unit?.label ?? '',
      tenantName: tenant?.full_name ?? '',
      tenantPhone: tenant?.phone ?? '',
    }
  })
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
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
export async function markDone({ jobId, landlordId, photo }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const providerId = sessionData.session?.user?.id
  if (!providerId) throw new Error('Please sign in again.')
  if (!photo) throw new Error('Add a proof photo before marking this job done.')

  const file = await compressPhoto(photo)
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
