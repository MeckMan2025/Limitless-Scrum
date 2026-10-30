// A database in the browser, standing in for Supabase.
//
// No-account mode: nobody signs in and nothing leaves the device. Every call
// the app makes to its Supabase URL is answered here instead, from tables kept
// in localStorage, speaking enough PostgREST (filters, order, limit, inserts,
// updates, deletes, upserts) for the app's own queries. Auth, storage, edge
// functions and RPCs get a polite empty answer.
//
// Installed once, before React mounts (see main.jsx), when VITE_DEMO is on.

import { looseEq, filterRows, orderRows, project } from './restQuery'

const KEY = 'limitless-local-db'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* full or blocked: keep going in memory */ }
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
}))

// ---- requests ---------------------------------------------------------------
function respond(body, status = 200, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers }
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: h })
}

async function handleRest(method, url, req) {
  const table = decodeURIComponent(url.pathname.replace(/^.*\/rest\/v1\//, '').split('/')[0])
  const params = url.searchParams
  const prefer = req.headers.get('prefer') || ''
  const accept = req.headers.get('accept') || ''
  const single = accept.includes('vnd.pgrst.object')
  const wantRows = prefer.includes('return=representation')
  const wantCount = /count=(exact|planned|estimated)/.test(prefer)
  const db = load()
  const rows = db[table] || []
  const select = params.get('select')

  const finish = (result, status = 200) => {
    if (single) {
      if (!result.length) return respond({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'none' }, 406)
      return respond(project(result[0], select), status)
    }
    const total = result.length
    const offset = Number(params.get('offset') || 0)
    const limit = params.get('limit') ? Number(params.get('limit')) : undefined
    const page = result.slice(offset, limit != null ? offset + limit : undefined).map((r) => project(r, select))
    const range = page.length ? `${offset}-${offset + page.length - 1}/${wantCount ? total : '*'}` : `*/${wantCount ? total : '*'}`
    return respond(page, status, { 'Content-Range': range })
  }

  if (method === 'GET' || method === 'HEAD') {
    const result = orderRows(filterRows(rows, params), params.get('order'))
    if (method === 'HEAD') {
      const r = finish(result)
      return new Response(null, { status: r.status, headers: r.headers })
    }
    return finish(result)
  }

  if (method === 'POST') {
    let body = []
    try { body = await req.json() } catch { body = [] }
    const incoming = Array.isArray(body) ? body : [body]
    const upsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates')
    const ignore = prefer.includes('resolution=ignore-duplicates')
    const conflictCols = (params.get('on_conflict') || 'id').split(',')
    const now = new Date().toISOString()
    const written = []
    for (const r of incoming) {
      const row = { ...r }
      if (row.id == null) row.id = uuid()
      if (!('created_at' in row)) row.created_at = now
      const idx = upsert ? rows.findIndex((x) => conflictCols.every((c) => looseEq(x[c], row[c]))) : -1
      if (idx >= 0) {
        if (!ignore) rows[idx] = { ...rows[idx], ...row, updated_at: now }
        written.push(rows[idx])
      } else {
        rows.push(row); written.push(row)
      }
    }
    db[table] = rows; save(db)
    if (!wantRows && !single) return new Response(null, { status: 201 })
    return finish(written, 201)
  }

  if (method === 'PATCH') {
    let patch = {}
    try { patch = await req.json() } catch { patch = {} }
    const matched = filterRows(rows, params)
    const now = new Date().toISOString()
    const ids = new Set(matched)
    const updated = []
    db[table] = rows.map((r) => { if (ids.has(r)) { const u = { ...r, ...patch, updated_at: now }; updated.push(u); return u } return r })
    save(db)
    if (!wantRows && !single) return new Response(null, { status: 204 })
    return finish(updated)
  }

  if (method === 'DELETE') {
    const matched = new Set(filterRows(rows, params))
    const removed = rows.filter((r) => matched.has(r))
    db[table] = rows.filter((r) => !matched.has(r))
    save(db)
    if (!wantRows && !single) return new Response(null, { status: 204 })
    return finish(removed)
  }

  return respond({ message: 'unsupported' }, 405)
}

export function installLocalDb(baseUrl) {
  if (!baseUrl || typeof window === 'undefined' || window.__localDbInstalled) return
  window.__localDbInstalled = true
  const base = baseUrl.replace(/\/$/, '')
  const realFetch = window.fetch.bind(window)

  window.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init)
    if (!req.url.startsWith(base)) return realFetch(input, init)
    const url = new URL(req.url)
    const basePath = new URL(base).pathname.replace(/\/$/, '')
    const path = url.pathname.slice(basePath.length)
    const method = (req.method || 'GET').toUpperCase()
    try {
      if (path.startsWith('/rest/v1/rpc/')) return respond([])
      if (path.startsWith('/rest/v1/')) return handleRest(method, url, req)
      if (path.startsWith('/auth/v1/')) return respond({})
      if (path.startsWith('/storage/v1/')) return respond([])
      if (path.startsWith('/functions/v1/')) return respond({ ok: true })
      return respond({})
    } catch (e) {
      console.warn('local db', path, e)
      return respond({ message: String(e?.message || e) }, 500)
    }
  }

  // Realtime would try a websocket to the fake host; give it something that
  // never connects and never throws.
  const RealWS = window.WebSocket
  window.WebSocket = function (url, protocols) {
    if (String(url).includes(new URL(base).host)) {
      const fake = { readyState: 3, send() {}, close() {}, addEventListener() {}, removeEventListener() {}, onopen: null, onclose: null, onerror: null, onmessage: null }
      return fake
    }
    return new RealWS(url, protocols)
  }
  window.WebSocket.prototype = RealWS.prototype
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
}

// Wipe everything (Settings → "Start over").
export function resetLocalDb() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
