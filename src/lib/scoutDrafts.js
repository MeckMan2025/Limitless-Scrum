// Match scouting that could not be sent yet.
//
// A venue has bad signal at exactly the moments scouting happens. A save that
// fails is kept here, on the phone, as a draft: the scout carries on with the
// next match, and the drafts go up on their own when the connection comes
// back — or when somebody presses Send. Nothing is lost to a dead spot.

import { restHeaders, ensureUserToken } from './restHeaders'
import { announceScoutSaved } from './scoutHandoff'

const KEY = 'scrum-scout-drafts'
const EVENT = 'scrum-scout-drafts-changed'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

export function listDrafts() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* no room: nothing to do */ }
  window.dispatchEvent(new Event(EVENT))
}
// Two kinds of draft:
//   'row'  — a finished match that could not be sent; it goes up by itself.
//   'form' — an unfinished form the scout put away to come back to; it waits
//            for them, never sent until they resume and press Save.
export function addDraft(table, row) {
  const list = listDrafts().filter(d => d.id !== row.id)
  list.push({ id: row.id, kind: 'row', table, row, at: new Date().toISOString(), tries: 0 })
  write(list)
}
export function addFormDraft(table, form, label) {
  const id = form._draftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const list = listDrafts().filter(d => d.id !== id)
  list.push({ id, kind: 'form', table, form: { ...form, _draftId: id }, label, at: new Date().toISOString() })
  write(list)
  return id
}
export function removeDraft(id) {
  write(listDrafts().filter(d => d.id !== id && d.row?.id !== id))
}
export function onDraftsChange(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

// The column a PostgREST error is about, when it is about one.
export function missingColumn(text) {
  const t = String(text || '')
  return /Could not find the '([a-z_0-9]+)' column/i.exec(t)?.[1]
    || /column (?:[a-z_]+\.)?"?([a-z_0-9]+)"? (?:of relation "[a-z_]+" )?does not exist/i.exec(t)?.[1]
    || null
}

// Send one row. Resolves { ok, dropped } or throws. A column the database
// lacks is dropped and reported, not fatal.
export async function sendRow(table, row) {
  await ensureUserToken()
  const body = { ...row }
  const dropped = []
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true, dropped }
    const text = await res.text()
    // Already there (sent once, then kept as a draft by mistake): that is a success.
    if (res.status === 409 || /duplicate key/i.test(text)) return { ok: true, dropped, duplicate: true }
    const col = missingColumn(text)
    if (!col || !(col in body)) throw new Error(text)
    delete body[col]; dropped.push(col)
  }
  throw new Error('gave up')
}

let flushing = false
// Try every draft. Returns how many went up. Safe to call often.
export async function flushDrafts() {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    for (const d of listDrafts()) {
      if (d.kind !== 'row') continue   // unfinished forms wait for their scout
      try {
        await sendRow(d.table, d.row)
        removeDraft(d.id)
        sent++
      } catch {
        const list = listDrafts()
        const it = list.find(x => x.id === d.id)
        if (it) { it.tries = (it.tries || 0) + 1; it.lastError = new Date().toISOString(); write(list) }
      }
    }
  } finally { flushing = false }
  if (sent) announceScoutSaved()
  return sent
}

// Wire the automatic resend once for the app: on coming back online, on the
// app returning to the front, and every half minute as a safety net.
let started = false
export function startDraftSender() {
  if (started) return
  started = true
  window.addEventListener('online', () => { flushDrafts() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushDrafts() })
  setInterval(() => { if (document.visibilityState === 'visible') flushDrafts() }, 30000)
  flushDrafts()
}
