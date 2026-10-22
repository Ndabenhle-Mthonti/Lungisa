import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient.js'

const TEN_MB = 10 * 1024 * 1024
const SIGNED_URL_SECONDS = 60 * 60
const MAX_EDGE = 1280
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

// Shrinks a phone photo to a JPEG. The long edge is about 1280px.
// The picture is drawn again as a new JPEG, so EXIF is dropped, including where it was taken.
// iPhone photos are often HEIC. The usual compressor rejects those, so Safari draws them instead.
export async function compressPhoto(file, preview) {
  if (!isAllowedPhoto(file)) {
    throw new Error('Please choose a photo from your camera or photo library.')
  }
  if (file.size > TEN_MB) {
    throw new Error('This photo is too large. Please choose one under 10 MB.')
  }

  // The preview is already on screen, so draw that. iPhone files often cannot be read again later.
  const shown = await jpegFromImage(preview)
  if (shown) return shown

  if (isHeic(file)) {
    const drawn = await compressWithCanvas(file)
    if (drawn) return drawn
  }

  try {
    // Loaded only when a photo is sent, so the job lists stay small.
    const { default: imageCompression } = await import('browser-image-compression')
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: MAX_EDGE,
      initialQuality: 0.7,
      maxSizeMB: 0.39,
      fileType: 'image/jpeg',
      preserveExif: false,
    })
    return new File([compressed], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    const drawn = await compressWithCanvas(file)
    if (drawn) return drawn
    throw new Error('This photo could not be prepared. Please try a different one.')
  }
}

function jpegFromImage(image) {
  if (!image) return Promise.resolve(null)
  return whenImageReady(image).then((ready) => {
    if (!ready) return null
    return drawJpeg(ready)
  })
}

function whenImageReady(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve(image)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(image.naturalWidth ? image : null), 2000)
    image.addEventListener('load', () => {
      window.clearTimeout(timer)
      resolve(image)
    }, { once: true })
    image.addEventListener('error', () => {
      window.clearTimeout(timer)
      resolve(null)
    }, { once: true })
  })
}

function drawJpeg(image) {
  return new Promise((resolve) => {
    try {
      const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1
      const scale = Math.min(1, MAX_EDGE / longest)
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      let settled = false
      const finish = (blob) => {
        if (settled) return
        settled = true
        resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : null)
      }
      const timer = window.setTimeout(() => {
        try {
          finish(blobFromCanvas(canvas))
        } catch {
          finish(null)
        }
      }, 1500)
      canvas.toBlob(
        (blob) => {
          window.clearTimeout(timer)
          if (blob) finish(blob)
          else {
            try {
              finish(blobFromCanvas(canvas))
            } catch {
              finish(null)
            }
          }
        },
        'image/jpeg',
        0.7,
      )
    } catch {
      resolve(null)
    }
  })
}

function blobFromCanvas(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
  const binary = atob(dataUrl.split(',')[1] || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/jpeg' })
}

// Uses the same decoder that showed the preview. That succeeds for iPhone photos the compressor refuses.
function compressWithCanvas(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1
      const scale = Math.min(1, MAX_EDGE / longest)
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : null)
        },
        'image/jpeg',
        0.7,
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

function isHeic(file) {
  const type = (file?.type || '').toLowerCase()
  const name = (file?.name || '').toLowerCase()
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')
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
export async function readChosenPhoto(event) {
  const input = event.currentTarget
  const picked = input.files?.[0]
  if (!picked || picked.size === 0) return null
  // Copy the bytes immediately. iPhone drops the original file once the picker closes.
  const bytes = await picked.arrayBuffer()
  const file = new File([bytes], picked.name || 'photo.jpg', {
    type: picked.type || 'image/jpeg',
    lastModified: picked.lastModified,
  })
  input.value = ''
  return file
}

// A phone camera often leaves the type and the file name blank.
function isAllowedPhoto(file) {
  const type = (file?.type || '').toLowerCase()
  if (ALLOWED_TYPES.has(type) || type.startsWith('image/')) return true
  const name = (file?.name || '').toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'].some((ext) => name.endsWith(ext))) return true
  if (!type || type === 'application/octet-stream') return file.size > 0
  return false
}
