import { restHeaders } from '../lib/restHeaders'

// Photos in storage cost egress every time someone's phone downloads one, and
// the free Supabase tier only allows 5 GB of that a month. Three habits keep
// the team's notebook photos well inside it:
//   1. a sensible full size (FULL) instead of the camera original,
//   2. a small thumbnail (THUMB) saved beside it for every tile and list,
//      with the full photo only loaded when someone opens it,
//   3. a year-long cache header, so a phone never downloads the same photo twice.
// Filenames are unique and never overwritten, which is what makes 3 safe.

export const FULL = { max: 1600, quality: 0.8 }
export const THUMB = { max: 400, quality: 0.7 }
const CACHE_CONTROL = 'max-age=31536000'
const UPLOAD_TIMEOUT_MS = 20000

// Scale an already-loaded <img> down to fit `max` and encode it as JPEG.
// Resolves to null when the browser can't encode it.
export function resizeToBlob(img, { max, quality }) {
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (!w || !h) return Promise.resolve(null)
  if (w > max || h > max) {
    if (w > h) { h = Math.round(h * max / w); w = max }
    else { w = Math.round(w * max / h); h = max }
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// Read a File into a decoded <img>. Rejects when the browser can't read it
// (an iPhone HEIC on Chrome, most often).
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode'))
      img.onload = () => resolve(img)
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

// Straight to the storage REST API with the anon key. supabase.storage.upload()
// first runs auth.getSession(), which can hang forever on a phone waking up
// with a stale token; the bucket policies let anon insert, so no session is
// needed. Returns the public URL.
export async function uploadPhotoBlob(supabaseUrl, supabaseKey, bucket, path, blob) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        ...restHeaders(),
        'Content-Type': blob.type || 'image/jpeg',
        'cache-control': CACHE_CONTROL,
        'x-upsert': 'false',
      },
      body: blob,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text().catch(() => '')}`)
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
  } finally {
    clearTimeout(timer)
  }
}

// Upload a full photo and its thumbnail as `<name>.jpg` and `<name>_thumb.jpg`.
// The thumbnail is best effort: if it fails, thumbUrl() still points at it and
// the <img> falls back to the full photo through thumbFallback.
export async function uploadPhotoWithThumb(supabaseUrl, supabaseKey, bucket, img, name) {
  const [full, thumb] = await Promise.all([resizeToBlob(img, FULL), resizeToBlob(img, THUMB)])
  if (!full) throw new Error('encode')

  // Both at once. Sent one after the other, a bad connection waited out two
  // 20-second timeouts back to back before falling back — forty seconds of
  // spinner, which is where "it just loads forever" came from. The thumbnail
  // stays best effort: if it fails the tiles fall back to the full photo, so
  // it must never hold the entry up or fail it.
  const [url] = await Promise.all([
    uploadPhotoBlob(supabaseUrl, supabaseKey, bucket, `${name}.jpg`, full),
    thumb
      ? uploadPhotoBlob(supabaseUrl, supabaseKey, bucket, `${name}_thumb.jpg`, thumb)
          .catch(err => console.error('Thumbnail upload failed, tiles will use the full photo:', err.message))
      : Promise.resolve(),
  ])
  return url
}

export const newPhotoName = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

// The thumbnail that sits beside a stored photo. Inline data: photos and
// anything not in our storage come back unchanged.
export function thumbUrl(url) {
  if (!url || !url.includes('/storage/v1/object/public/')) return url
  if (/_thumb\.jpg$/i.test(url)) return url
  return /\.jpe?g$/i.test(url) ? url.replace(/\.jpe?g$/i, '_thumb.jpg') : url
}

// onError for a thumbnail <img>: swap to the full photo once, and only call
// `onFail` (usually "hide it") if the full one is broken too.
export const thumbFallback = (fullUrl, onFail) => (e) => {
  const el = e.currentTarget
  if (fullUrl && el.dataset.fellBack !== '1' && el.src !== fullUrl) {
    el.dataset.fellBack = '1'
    el.src = fullUrl
  } else if (onFail) {
    onFail(el)
  }
}

// For the lower-traffic buckets (season photos, workshop steps and gallery):
// shrink to FULL and upload with the long cache header. Anything the browser
// can't decode, or a GIF that resizing would freeze, goes up as it is.
export async function uploadImageFile(supabaseUrl, supabaseKey, bucket, file) {
  let body = file
  let ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  if (file.type !== 'image/gif') {
    try {
      const blob = await resizeToBlob(await loadImageFile(file), FULL)
      if (blob && blob.size < file.size) { body = blob; ext = 'jpg' }
    } catch { /* upload the original */ }
  }
  return uploadPhotoBlob(supabaseUrl, supabaseKey, bucket, `${newPhotoName()}.${ext}`, body)
}
