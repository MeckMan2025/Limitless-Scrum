// Limitless Scrum's server, as it runs on the robotics server.
//
// One process serves the built app and stands in for the Supabase project it
// was written against, all under the app's path (BASE_PATH_1, e.g. /scrum):
//
//   /scrum/                         the app (dist/), and /scrum/helper/ for EN Helper
//   /scrum/healthz                  200 when the database answers (robotics.yml)
//   /scrum/api/auth/v1/...          accounts                       auth.js
//   /scrum/api/rest/v1/...          the app's tables               rest.js
//   /scrum/api/realtime/v1/websocket  live updates                 realtime.js
//   /scrum/api/storage/v1/...       uploaded files                 storage.js
//   /scrum/api/functions/v1/...     account tools                  functions.js
//
// Every computer signed in to the same address sees the same boards, calendar
// and settings, and sees each other's changes as they are made.
//
//   node server/index.js                 run it (PG* variables say which database)
//   node server/cli.js approve <email>   invite someone (the first account, mostly)

import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, migrate } from './db.js'
import { handleAuth, callerFrom } from './auth.js'
import { handleRest } from './rest.js'
import { handleStorage, openFile } from './storage.js'
import { handleFunction } from './functions.js'
import { attachRealtime } from './realtime.js'

const BASE = (process.env.BASE_PATH_1 || process.env.BASE_PATH || '/scrum').replace(/\/+$/, '')
const PORT = Number(process.env.PORT || 8080)
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const API = `${BASE}/api`
const MAX_JSON = 25 * 1024 * 1024

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
}

class TooLarge extends Error {}

function bodyReader(req) {
  let done = null
  return (limit) => (done ||= new Promise((ok, fail) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { fail(new TooLarge()); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks)))
    req.on('error', fail)
  }))
}

function sendJson(res, status, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { ...(text ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers })
  res.end(text)
}

async function serveFile(res, file, req, cacheForever) {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return false
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    // Hashed build files never change; everything else is checked each time,
    // so a release reaches everyone on their next visit.
    'Cache-Control': cacheForever ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
  return true
}

async function serveApp(req, res, path) {
  const rel = decodeURIComponent(path.slice(BASE.length)) || '/'
  const file = resolve(DIST, '.' + rel)
  if (file.startsWith(DIST + sep) && await serveFile(res, file, req, rel.startsWith('/assets/'))) return
  if (rel.startsWith('/assets/')) return sendJson(res, 404, { error: 'Not found' })
  // Anything else is a screen inside one of the two apps.
  const page = rel.startsWith('/helper') ? resolve(DIST, 'helper/index.html') : resolve(DIST, 'index.html')
  if (!(await serveFile(res, page, req, false))) sendJson(res, 503, { error: 'The app has not been built (npm run build)' })
}

async function serveApi(req, res, path, url) {
  const method = req.method.toUpperCase()
  if (method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const readBody = bodyReader(req)
  const parseJson = async () => {
    const raw = await readBody(MAX_JSON)
    if (!raw.length) return null
    try { return JSON.parse(raw.toString()) } catch { return null }
  }
  const sub = path.slice(API.length)
  const claims = await callerFrom(req)

  if (sub.startsWith('/auth/v1/')) {
    const r = await handleAuth(method, sub.slice(8), url.searchParams, await parseJson(), req)
    return sendJson(res, r.status, r.body)
  }
  if (sub.startsWith('/rest/v1/')) {
    const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await parseJson() : null
    const r = await handleRest(method, sub.slice(8), url.searchParams, body, req, claims)
    return sendJson(res, r.status, r.body, r.headers)
  }
  if (sub.startsWith('/storage/v1/')) {
    const r = await handleStorage(method, sub.slice(11), req, readBody, claims)
    if (!r.file) return sendJson(res, r.status, r.body)
    res.writeHead(200, { 'Content-Type': r.contentType, 'Content-Length': r.size, 'Cache-Control': 'public, max-age=3600' })
    if (method === 'HEAD') return res.end()
    return openFile(r.file).pipe(res)
  }
  if (sub.startsWith('/functions/v1/')) {
    const r = await handleFunction(method, sub.slice(14), await parseJson(), claims)
    return sendJson(res, r.status, r.body)
  }
  return sendJson(res, 404, { error: 'Not found' })
}

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const url = new URL(req.url, 'http://local')
  const path = url.pathname
  res.on('finish', () => {
    if (res.statusCode >= 500) console.error(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`)
  })
  try {
    if (path === `${BASE}/healthz`) {
      await pool.query('select 1')
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      return res.end('ok')
    }
    if (path === API || path.startsWith(`${API}/`)) return await serveApi(req, res, path, url)
    if (path === BASE || path === '/') { res.writeHead(302, { Location: `${BASE}/` }); return res.end() }
    if (path.startsWith(`${BASE}/`)) return await serveApp(req, res, path)
    return sendJson(res, 404, { error: 'Not found' })
  } catch (e) {
    if (e instanceof TooLarge) return sendJson(res, 413, { error: 'Too large' })
    console.error(`${req.method} ${path} failed:`, e)
    if (!res.headersSent) sendJson(res, 500, { message: 'Server error' })
    else res.end()
  }
})

attachRealtime(server, `${API}/realtime/v1/websocket`)

await migrate()
server.listen(PORT, () => console.log(`Limitless Scrum on :${PORT}${BASE}/`))

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close()
    pool.end().finally(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
