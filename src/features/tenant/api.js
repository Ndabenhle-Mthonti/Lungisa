import { supabase } from '../../lib/supabaseClient.js'
import { compressPhoto, reportPhotoPath, uploadPhoto } from '../../lib/photos.js'

const CATEGORIES = ['plumbing', 'electrical', 'lock', 'appliance', 'other']
const PAGE_SIZE = 20

export { categoryLabel } from '../../lib/jobStatus.js'

// The flat label and the ids the report must store. The tenant does not type these.
export async function fetchTenantPlace() {
  const { data: sessionData } = await supabase.auth.getSession()
  const tenantId = sessionData.session?.user?.id
  if (!tenantId) throw new Error('Please sign in again.')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('unit_id, landlord_id')
    .eq('id', tenantId)
    .single()
  if (profileError || !profile?.unit_id || !profile.landlord_id) {
    throw new Error('Your flat could not be loaded. Please try again.')
  }

  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('label')
    .eq('id', profile.unit_id)
    .single()
  if (unitError || !unit?.label) {
    throw new Error('Your flat could not be loaded. Please try again.')
  }

  return {
    tenantId,
    unitId: profile.unit_id,
    landlordId: profile.landlord_id,
    label: unit.label,
  }
}

// Compresses the photo, stores it, then creates the pending job.
// jobId is chosen in the browser so the file path and the row match.
// alreadyUploaded is true on a retry after the file was saved but the row was not.
export async function sendReport({ jobId, category, description, photo, preview, isUrgent = false, alreadyUploaded }) {
  if (!CATEGORIES.includes(category)) {
    throw new Error('Choose what the problem is.')
  }

  const place = await fetchTenantPlace()
  const photoPath = reportPhotoPath(place.landlordId, jobId)

  const report = {
    id: jobId,
    landlord_id: place.landlordId,
    unit_id: place.unitId,
    tenant_id: place.tenantId,
    category,
    description: description.trim().slice(0, 500),
    photo_path: photoPath,
    status: 'pending',
    is_urgent: Boolean(isUrgent),
  }

  if (!alreadyUploaded) {
    const compressed = await compressPhoto(photo, preview)
    try {
      await uploadPhoto({ bucket: 'job-photos', path: photoPath, file: compressed })
    } catch (error) {
      if (photoAlreadyStored(error)) {
        await insertReport(report, true)
        return
      }
      // The storage rule on a database that has not run 0009 only allows the
      // upload after the job row exists. Save the row, then store the photo.
      if (!storageNeedsJobFirst(error)) throw error
      await insertReport(report, false)
      await uploadPhoto({ bucket: 'job-photos', path: photoPath, file: compressed })
      return
    }
  }

  await insertReport(report, true)
}

async function insertReport(report, uploaded) {
  const { error } = await supabase.from('jobs').insert(report)
  if (!error || error.code === '23505') return
  const insertError = new Error('The report could not be sent. Please try again.')
  insertError.uploaded = uploaded
  throw insertError
}

function photoAlreadyStored(error) {
  const cause = error?.cause
  const message = String(cause?.message ?? error?.message ?? '')
  const status = String(cause?.statusCode ?? cause?.status ?? '')
  return status === '409' || /already exists|duplicate/i.test(message)
}

// Newest first. The next page starts strictly before the last row's time,
// and the id breaks a tie when two reports share a timestamp.
// The tenant id has to be in the query. Row Level Security already hides other
// people's jobs, but its rules are combined with OR, and without this filter
// Postgres scans the whole table to find the first 20 rows.
export async function fetchTenantRequests(cursor) {
  const { data: sessionData } = await supabase.auth.getSession()
  const tenantId = sessionData.session?.user?.id
  if (!tenantId) throw new Error('Please sign in again.')

  let query = supabase
    .from('jobs')
    .select('id, category, description, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)

  if (cursor) {
    const createdAt = `"${cursor.createdAt}"`
    const id = `"${cursor.id}"`
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    )
  }

  const { data, error } = await query
  if (error) throw new Error('Your requests could not be loaded. Please try again.')

  const rows = data ?? []
  const last = rows[rows.length - 1]
  return {
    rows,
    nextCursor: rows.length === PAGE_SIZE && last
      ? { createdAt: last.created_at, id: last.id }
      : null,
  }
}

// One request for the details screen. Only this tenant's row can come back.
export async function fetchTenantRequest(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, category, description, status, created_at, photo_path, proof_photo_path, reopen_count')
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw new Error('This request could not be loaded. Please try again.')
  return data
}

// Sends a finished job back to the same provider. Only the status and the note are sent.
export async function reopenRequest({ jobId, note }) {
  const trimmed = note.trim()
  if (trimmed.length < 5) {
    throw new Error('Please write a short note.')
  }

  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'assigned', reopen_note: trimmed })
    .eq('id', jobId)
    .select('id, status, reopen_count, proof_photo_path')
    .maybeSingle()

  if (error || !data) {
    throw new Error('This request could not be sent back. Please try again.')
  }
  return data
}

function storageNeedsJobFirst(error) {
  const cause = error?.cause
  const message = String(cause?.message ?? error?.message ?? '')
  const status = String(cause?.statusCode ?? cause?.status ?? '')
  return status === '403' || /row-level security/i.test(message)
}
