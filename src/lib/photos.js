import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient.js'

const TEN_MB = 10 * 1024 * 1024
const SIGNED_URL_SECONDS = 60 * 60
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'])

// Shrinks a phone photo to a JPEG. The long edge is about 1280px and the file stays under about 400 KB.
// The picture is drawn again as a new JPEG, so EXIF is dropped, including where it was taken.
export async function compressPhoto(file) {
  if (!isAllowedPhoto(file)) {
    throw new Error('Please choose a JPEG, PNG, or HEIC photo.')
  }
  if (file.size > TEN_MB) {
    throw new Error('This photo is too large. Please choose one under 10 MB.')
  }

  try {
    // Loaded only when a photo is sent, so the job lists stay small.
    const { default: imageCompression } = await import('browser-image-compression')
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: 1280,
      initialQuality: 0.7,
      maxSizeMB: 0.39,
      fileType: 'image/jpeg',
      preserveExif: false,
    })
    return new File([compressed], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    throw new Error('This photo could not be prepared. Please try a different one.')
  }
}

// Puts the file in a private bucket at the given path. A second upload of the same path is rejected.
export async function uploadPhoto({ bucket, path, file }) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) {
    const uploadError = new Error('The photo could not be uploaded. Please try again.')
    uploadError.cause = error
    throw uploadError
  }
}

// A list thumbnail. Asks storage for a 120px-wide picture, and uses the full file if this project cannot resize.
export function useJobThumbnail(path, { plain = false } = {}) {
  return useQuery({
    queryKey: ['job-thumbnail', path, plain ? 'plain' : 'small'],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: () => signJobThumbnail(path, { plain }),
  })
}

async function signJobThumbnail(path, { plain }) {
  if (!plain) {
    const small = await createJobPhotoUrl(path, { width: 120, resize: 'cover' })
    if (small) return { url: small, transformed: true }
  }

  const full = await createJobPhotoUrl(path)
  if (!full) throw new Error('The photo could not be opened. Please try again.')
  return { url: full, transformed: false }
}

async function createJobPhotoUrl(path, transform) {
  const { data, error } = await supabase.storage
    .from('job-photos')
    .createSignedUrl(path, SIGNED_URL_SECONDS, transform ? { transform } : undefined)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

// Returns a signed link that lasts about 60 minutes. The same path reuses the cached link until it is close to expiring.
export function useSignedUrl(bucket, path) {
  return useQuery({
    queryKey: ['signed-url', bucket, path],
    enabled: Boolean(bucket && path),
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_SECONDS)
      if (error || !data?.signedUrl) {
        throw new Error('The photo could not be opened. Please try again.')
      }
      return data.signedUrl
    },
  })
}

// Path inside the job-photos bucket: landlordId/jobId/report.jpg
export function reportPhotoPath(landlordId, jobId) {
  return landlordId + '/' + jobId + '/report.jpg'
}

// Path inside the proof-photos bucket. The timestamp keeps the previous proof file when a job is sent back.
export function proofPhotoPath(landlordId, jobId, timestamp = Date.now()) {
  return landlordId + '/' + jobId + '/proof-' + timestamp + '.jpg'
}

// Reads the photo the phone just took. The file is copied first, because clearing
// the control in the same moment can wipe the picture on a phone.
export function readChosenPhoto(event) {
  const input = event.currentTarget
  const picked = input.files?.[0]
  if (!picked || picked.size === 0) return null
  const file = new File([picked], picked.name || 'photo.jpg', {
    type: picked.type,
    lastModified: picked.lastModified,
  })
  window.setTimeout(() => {
    input.value = ''
  }, 0)
  return file
}

// A phone camera often leaves the type and the file name blank.
function isAllowedPhoto(file) {
  const type = (file?.type || '').toLowerCase()
  if (ALLOWED_TYPES.has(type) || type.startsWith('image/')) return true
  const name = (file?.name || '').toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'].some((ext) => name.endsWith(ext))) return true
  if (!type || type === 'application/octet-stream') return file.size > 0
  return false
}
