// The app's tables: the part of PostgREST the app uses, at /rest/v1.
//
// The same reads and writes src/lib/localDb.js answered in the browser,
// answered here from PostgreSQL for everyone: filters, order, limit/offset,
// counts, single-object reads, inserts, upserts, updates and deletes. The
// query language itself is shared (src/lib/restQuery.js).
//
// Only signed-in people may read or write. The one exception is the question
// the sign-up screen asks before an account exists: is this email invited?

import { randomUUID } from 'node:crypto'
import { looseEq, filterRows, orderRows, project } from '../src/lib/restQuery.js'
import { pool, validTable, readTable, lockTable, putRow, deleteRow, transaction } from './db.js'
import { approvedRole } from './auth.js'
import { publish } from './realtime.js'

const json = (status, body, headers = {}) => ({ status, body, headers })

// Columns that were UNIQUE in the Supabase schema, where the app relies on it.
const UNIQUE = { approved_emails: ['email'] }
const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const pgError = (status, code, message) => json(status, { code, message, details: null, hint: null })

// path is what follows /rest/v1. claims: the signed-in person, or null.
export async function handleRest(method, path, query, body, req, claims) {
  if (path.startsWith('/rpc/')) {
    const fn = path.slice(5)
    if (fn === 'check_approved_email') return json(200, await approvedRole(body?.p_email ?? query.get('p_email')))
    if (!claims) return pgError(401, 'PGRST301', 'Sign in first')
    return pgError(404, 'PGRST202', `Could not find the function public.${fn}`)
  }

  if (!claims) return pgError(401, 'PGRST301', 'Sign in first')

  const table = decodeURIComponent(path.replace(/^\//, '').split('/')[0])
  if (!validTable(table)) return pgError(404, 'PGRST205', `Could not find the table 'public.${table}'`)

  const prefer = String(req.headers.prefer || '')
  const accept = String(req.headers.accept || '')
  const single = accept.includes('vnd.pgrst.object')
  const wantRows = prefer.includes('return=representation')
  const wantCount = /count=(exact|planned|estimated)/.test(prefer)
  const select = query.get('select')

  const finish = (result, status = 200) => {
    if (single) {
      if (result.length !== 1) {
        return pgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned')
      }
      return json(status, project(result[0], select))
    }
    const total = result.length
    const offset = Number(query.get('offset') || 0)
    const limit = query.get('limit') ? Number(query.get('limit')) : undefined
    const page = result.slice(offset, limit != null ? offset + limit : undefined).map((r) => project(r, select))
    const range = page.length ? `${offset}-${offset + page.length - 1}/${wantCount ? total : '*'}` : `*/${wantCount ? total : '*'}`
    return json(status, page, { 'Content-Range': range })
  }

  if (method === 'GET' || method === 'HEAD') {
    const rows = await readTable(pool, table, query)
    const r = finish(orderRows(filterRows(rows, query), query.get('order')))
    return method === 'HEAD' ? { ...r, body: undefined } : r
  }

  if (method === 'POST') {
    const incoming = Array.isArray(body) ? body : (body && typeof body === 'object' ? [body] : [])
    const ignore = prefer.includes('resolution=ignore-duplicates')
    const upsert = ignore || prefer.includes('resolution=merge-duplicates')
    const conflictCols = (query.get('on_conflict') || 'id').split(',').map((c) => c.trim())
    const now = new Date().toISOString()
    const changes = []
    const written = await transaction(async (db) => {
      await lockTable(db, table)
      const rows = upsert || UNIQUE[table] ? await readTable(db, table) : []
      const out = []
      for (const r of incoming) {
        const row = { ...r }
        const idx = upsert ? rows.findIndex((x) => conflictCols.every((c) => row[c] !== undefined && looseEq(x[c], row[c]))) : -1
        if (idx >= 0) {
          if (ignore) { out.push(rows[idx]); continue }
          // The row keeps its own id whatever the conflict was matched on.
          const merged = { ...rows[idx], ...row, id: rows[idx].id, updated_at: now }
          await putRow(db, table, merged)
          changes.push({ table, type: 'UPDATE', record: merged, old_record: rows[idx] })
          rows[idx] = merged
          out.push(merged)
          continue
        }
        if (row.id == null) row.id = randomUUID()
        if (!('created_at' in row)) row.created_at = now
        if (!upsert) {
          const clash = await db.query('select 1 from rows where tbl = $1 and id = $2', [table, String(row.id)])
          const uniqueClash = (UNIQUE[table] || []).some((c) => row[c] != null && rows.some((x) => sameText(x[c], row[c])))
          if (clash.rowCount || uniqueClash) {
            const e = new Error(`duplicate key value violates unique constraint "${table}_pkey"`)
            e.pgrst = pgError(409, '23505', e.message)
            throw e
          }
        }
        await putRow(db, table, row)
        changes.push({ table, type: 'INSERT', record: row })
        if (upsert || UNIQUE[table]) rows.push(row)
        out.push(row)
      }
      return out
    }).catch((e) => { if (e.pgrst) return e; throw e })
    if (written instanceof Error) return written.pgrst
    publish(changes)
    if (!wantRows && !single) return json(201, undefined)
    return finish(written, 201)
  }

  if (method === 'PATCH') {
    const patch = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
    const now = new Date().toISOString()
    const changes = []
    const updated = await transaction(async (db) => {
      await lockTable(db, table)
      const matched = filterRows(await readTable(db, table, query), query)
      const out = []
      for (const r of matched) {
        const u = { ...r, ...patch, id: r.id, updated_at: patch.updated_at ?? now }
        await putRow(db, table, u)
        changes.push({ table, type: 'UPDATE', record: u, old_record: r })
        out.push(u)
      }
      return out
    })
    publish(changes)
    if (!wantRows && !single) return json(204, undefined)
    return finish(updated)
  }

  if (method === 'DELETE') {
    const changes = []
    const removed = await transaction(async (db) => {
      await lockTable(db, table)
      const matched = filterRows(await readTable(db, table, query), query)
      for (const r of matched) {
        await deleteRow(db, table, r.id)
        changes.push({ table, type: 'DELETE', old_record: r })
      }
      return matched
    })
    publish(changes)
    if (!wantRows && !single) return json(204, undefined)
    return finish(removed)
  }

  return pgError(405, 'PGRST000', 'Method not allowed')
}
