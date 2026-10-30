// Uploaded files: the part of Supabase Storage the app uses, at /storage/v1.
//
// Photos, receipts and recordings are written to UPLOAD_DIR (a Docker volume,
// never inside the container) as <bucket>/<path>; the database remembers each
// file's type. Uploading needs a sign-in. Reading through /object/public/...
// does not, because the app puts those addresses straight into <img> tags,
// as every bucket was public on Supabase.

import { createReadStream } from 'node:fs'
import { mkdir, writeFile, rm, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pool } from './db.js'

const ROOT = resolve(process.env.UPLOAD_DIR || './uploads')
const MAX_BYTES = 50 * 1024 * 1024

// bucket/path from the URL, refused if it could step outside the folder.
function locate(bucket, path) {
  const b = decodeURIComponent(bucket || '')
  const p = String(path || '').split('/').map((s) => decodeURIComponent(s)).join('/')
  if (!/^[\w.-]+$/.test(b) || !p || p.split('/').some((s) => !s || s === '.' || s === '..' || s.includes('\0'))) return null
  const file = resolve(ROOT, b, p)
  if (!file.startsWith(ROOT + sep)) return null
  return { bucket: b, path: p, file }
}

const json = (status, body) => ({ status, body })

// Returns { status, body } or, for a file, { status, file, contentType, size }.
export async function handleStorage(method, path, req, readBody, claims) {
  const pub = /^\/object\/public\/([^/]+)\/(.+)$/.exec(path)
  if (pub && (method === 'GET' || method === 'HEAD')) {
    const where = locate(pub[1], pub[2])
    if (!where) return json(400, { error: 'Invalid path' })
    const { rows } = await pool.query('select content_type from storage_objects where bucket = $1 and path = $2', [where.bucket, where.path])
    const info = await stat(where.file).catch(() => null)
    if (!info?.isFile()) return json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' })
    return { status: 200, file: where.file, size: info.size, contentType: rows[0]?.content_type || 'application/octet-stream' }
  }

  if (!claims) return json(401, { statusCode: '401', error: 'Unauthorized', message: 'Sign in first' })

  const obj = /^\/object\/([^/]+)\/(.+)$/.exec(path)
  if (obj && (method === 'POST' || method === 'PUT')) {
    const where = locate(obj[1], obj[2])
    if (!where) return json(400, { error: 'Invalid path' })
    const upsert = method === 'PUT' || String(req.headers['x-upsert'] || '') === 'true'
    if (!upsert && await stat(where.file).catch(() => null)) {
      return json(409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
    }
    const data = await readBody(MAX_BYTES)
    await mkdir(dirname(where.file), { recursive: true })
    await writeFile(where.file, data)
    const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0]
    await pool.query(
      `insert into storage_objects (bucket, path, content_type, size) values ($1, $2, $3, $4)
       on conflict (bucket, path) do update set content_type = excluded.content_type, size = excluded.size, created_at = now()`,
      [where.bucket, where.path, type, data.length],
    )
    return json(200, { Key: `${where.bucket}/${where.path}`, Id: `${where.bucket}/${where.path}` })
  }

  // supabase.storage.from(bucket).remove([...paths])
  const del = /^\/object\/([^/]+)\/?$/.exec(path)
  if (del && method === 'DELETE') {
    const body = JSON.parse((await readBody(1024 * 1024)).toString() || '{}')
    const removed = []
    for (const p of body.prefixes || []) {
      const where = locate(del[1], p)
      if (!where) continue
      await rm(where.file, { force: true })
      await pool.query('delete from storage_objects where bucket = $1 and path = $2', [where.bucket, where.path])
      removed.push({ name: where.path, bucket_id: where.bucket })
    }
    return json(200, removed)
  }

  return json(404, { error: 'Not found' })
}

export const openFile = (file) => createReadStream(file)
