// One-time cleanup so notebook photos fit the Supabase free tier.
//
//   1. Every photo already in the notebook-photos bucket is re-encoded to the
//      app's new size (1600px, JPEG q80) and written back to the SAME path, so
//      no database row changes. It gets a <name>_thumb.jpg beside it and a
//      year-long cache header. If re-encoding wouldn't make a file smaller, the
//      original bytes go back up unchanged (still picking up the cache header).
//   2. Entries whose photo is stored inline as a base64 data: URL are moved into
//      the bucket the same way, and photo_url is pointed at the new file. The
//      old values are saved to a local backup JSON first.
//
// Dry run by default: it prints what it would do and the before/after sizes.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/shrink-notebook-photos.mjs            # dry run
//   node scripts/shrink-notebook-photos.mjs --apply    # do it
//
// The service role key is in the Supabase dashboard under Project Settings → API.
// Never commit it.

import { writeFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')
const BUCKET = 'notebook-photos'
const FULL = { max: 1600, quality: 80 }
const THUMB = { max: 400, quality: 70 }
const CACHE = 'max-age=31536000'
const BACKUP = 'notebook_inline_photos_backup.json'

if (!URL_ || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const kb = (n) => `${Math.round(n / 1024)} KB`

const encode = (buf, { max, quality }) =>
  sharp(buf).rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()

async function upload(path, body) {
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'image/jpeg', 'cache-control': CACHE, 'x-upsert': 'true' },
    body,
  })
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`)
}

async function listBucket() {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`list: ${res.status} ${await res.text()}`)
    const page = await res.json()
    out.push(...page.filter(o => o.id)) // folders have no id
    if (page.length < 1000) return out
  }
}

// ── 1. Photos already in the bucket ──
const objects = await listBucket()
const names = new Set(objects.map(o => o.name))
const originals = objects.filter(o => /\.jpe?g$/i.test(o.name) && !/_thumb\.jpg$/i.test(o.name))
console.log(`${originals.length} photos in ${BUCKET}${APPLY ? '' : ' (dry run)'}`)

let before = 0, after = 0, thumbs = 0, failed = 0
for (const o of originals) {
  try {
    const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${o.name}`, { headers: auth })
    if (!res.ok) throw new Error(`download ${res.status}`)
    const orig = Buffer.from(await res.arrayBuffer())
    const full = await encode(orig, FULL)
    const keep = full.length < orig.length ? full : orig
    const thumb = await encode(orig, THUMB)
    const thumbName = o.name.replace(/\.jpe?g$/i, '_thumb.jpg')
    before += orig.length
    after += keep.length + thumb.length
    thumbs += thumb.length
    console.log(`  ${o.name}  ${kb(orig.length)} → ${kb(keep.length)} + thumb ${kb(thumb.length)}${names.has(thumbName) ? ' (thumb exists, replacing)' : ''}`)
    if (APPLY) {
      await upload(o.name, keep)
      await upload(thumbName, thumb)
    }
  } catch (err) {
    failed++
    console.error(`  ! ${o.name}: ${err.message}`)
  }
}
console.log(`Bucket: ${kb(before)} → ${kb(after)} (thumbnails ${kb(thumbs)}), ${failed} failed\n`)

// ── 2. Inline base64 photos in notebook_entries ──
const res = await fetch(`${URL_}/rest/v1/notebook_entries?select=id,photo_url&photo_url=like.data:*`, { headers: auth })
if (!res.ok) throw new Error(`read entries: ${res.status} ${await res.text()}`)
const inline = await res.json()
console.log(`${inline.length} entries with an inline photo`)

if (APPLY && inline.length) {
  if (existsSync(BACKUP)) {
    console.error(`${BACKUP} already exists — move it somewhere safe first so it isn't overwritten.`)
    process.exit(1)
  }
  writeFileSync(BACKUP, JSON.stringify(inline, null, 2))
  console.log(`Backed up old photo_url values to ${BACKUP}`)
}

let moved = 0, inlineBytes = 0, inlineFailed = 0
for (const e of inline) {
  try {
    const m = /^data:image\/[a-z+]+;base64,(.*)$/is.exec(e.photo_url)
    if (!m) throw new Error('not a base64 image')
    const orig = Buffer.from(m[1], 'base64')
    const full = await encode(orig, FULL)
    const thumb = await encode(orig, THUMB)
    const name = `${Date.now()}-inline-${e.id}`
    inlineBytes += e.photo_url.length
    console.log(`  entry ${e.id}  ${kb(e.photo_url.length)} inline → ${name}.jpg ${kb(full.length)} + thumb ${kb(thumb.length)}`)
    if (APPLY) {
      await upload(`${name}.jpg`, full)
      await upload(`${name}_thumb.jpg`, thumb)
      const url = `${URL_}/storage/v1/object/public/${BUCKET}/${name}.jpg`
      const up = await fetch(`${URL_}/rest/v1/notebook_entries?id=eq.${encodeURIComponent(e.id)}`, {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ photo_url: url }),
      })
      if (!up.ok) throw new Error(`update entry: ${up.status} ${await up.text()}`)
    }
    moved++
  } catch (err) {
    inlineFailed++
    console.error(`  ! entry ${e.id}: ${err.message}`)
  }
}
console.log(`Inline: ${moved} ${APPLY ? 'moved' : 'to move'} (${kb(inlineBytes)} out of the database), ${inlineFailed} failed`)
if (!APPLY) console.log('\nDry run only. Re-run with --apply to make these changes.')
