import { restHeaders, hasUserToken, refreshSessionViaRest } from '../lib/restHeaders'
import { stampTeam, storedTeamScope } from '../lib/teamScope'
import { ACTIVE_SEASON } from '../data/season'
import { claimNotebookAttendance } from '../lib/notebookAttendance'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const AUDIO_BUCKET = 'notebook-audio'

// ─── Is the server side switched on? ──────────────────────────────────────
// The voice columns arrive with supabase/en_helper.sql. Until then a voice
// entry has nowhere to go, so the Helper says so instead of failing at Save.
export async function voiceBackendReady() {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?select=ai_status,complete&limit=1`, { headers: restHeaders() })
    return res.ok
  } catch {
    // Offline: assume it's there. Saving queues on the phone either way.
    return true
  }
}

// ─── Waiting room on the phone ────────────────────────────────────────────
// A recording is written here before anything is sent, and removed only once
// the entry is saved. Bad shop wifi, a closed app or a dead battery leaves it
// here to send next time, so a student never loses what they said.

const DB_NAME = 'en-helper'
const STORE = 'pending'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = fn(tx.objectStore(STORE))
    tx.oncomplete = () => { db.close(); resolve(result?.result ?? result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// The item carries its audio as an ArrayBuffer (item.audio, item.audioType)
// rather than a Blob: older iPhones could not store a Blob in IndexedDB.
export async function queueEntry(item) {
  await withStore('readwrite', store => store.put(item))
}

export async function pendingEntries(username) {
  try {
    const all = await withStore('readonly', store => store.getAll())
    return (all || []).filter(e => e.username === username)
  } catch {
    return []
  }
}

async function dropEntry(id) {
  await withStore('readwrite', store => store.delete(id)).catch(() => {})
}

// ─── Sending one ──────────────────────────────────────────────────────────

// A phone waking from sleep can hold an expired token, and an upload sent
// without a live one is refused. Renew it first (lib/restHeaders.js, no
// lock to get stuck on), but never wait forever on it.
async function freshSession() {
  if (hasUserToken()) return
  await Promise.race([
    refreshSessionViaRest(),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]).catch(() => {})
}

async function uploadClip(path, buffer, type) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${AUDIO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Content-Type': type || 'audio/wav', 'x-upsert': 'false' },
    body: buffer,
  })
  if (res.ok) return
  const text = await res.text().catch(() => '')
  // Already there from an earlier try that lost its connection afterwards.
  if (res.status === 409 || /already exists|Duplicate/i.test(text)) return
  throw new Error(`upload ${res.status}: ${text.slice(0, 200)}`)
}

async function insertEntry(row) {
  const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries`, {
    method: 'POST',
    headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  })
  if (res.ok) return
  const text = await res.text().catch(() => '')
  // Same: saved by an earlier try whose answer never arrived.
  if (res.status === 409 || /duplicate key/i.test(text)) return
  throw new Error(`save ${res.status}: ${text.slice(0, 200)}`)
}

// Ask the server to transcribe and polish now. Not awaited by anything: if it
// doesn't arrive, the 15 minute job picks the entry up anyway.
export function requestProcessing(entryId) {
  fetch(`${supabaseUrl}/functions/v1/notebook-voice`, {
    method: 'POST',
    headers: restHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action: 'process', entry_id: entryId }),
    keepalive: true,
  }).catch(() => {})
}

// Send one queued recording: the clip, and the entry it starts. The entry is
// saved as unfinished (complete: false), so it doesn't count for anything
// until every question is answered; finishEntry() is what completes it. Throws
// on failure, leaving it queued on the phone.
export async function sendEntry(item) {
  await freshSession()
  const ext = item.audioType === 'audio/wav' ? 'wav' : (item.audioType || '').includes('mp4') ? 'm4a' : 'webm'
  const path = `${item.team_number || 'radical'}/${item.id}.${ext}`
  await uploadClip(path, item.audio, item.audioType)

  // An ordinary notebook row, so the list, the book and the dashboards all
  // show it. The questions fill in its fields one by one.
  await insertEntry(stampTeam({
    id: item.id,
    username: item.username,
    meeting_date: item.meeting_date,
    category: 'Technical',
    custom_category: '',
    what_did: '',
    why_option: '',
    why_note: '',
    engagement: '',
    engagement_note: '',
    mentor_help: false,
    mentor_name: '',
    mentor_note: '',
    project_id: '',
    project_link: '',
    photo_url: '',
    season: ACTIVE_SEASON,
    signals: [],
    signal_data: {},
    next_step: '',
    source: 'voice',
    ai_status: 'pending',
    ai_attempts: 0,
    audio_path: path,
    complete: false,
    voice_state: { confirmed: [] },
    created_at: item.created_at,
  }, item.team_number))

  await dropEntry(item.id)
}

const callVoice = async (body, { timeoutMs = 60000, keepalive = false } = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/notebook-voice`, {
      method: 'POST',
      headers: restHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: keepalive ? undefined : controller.signal,
      keepalive,
    })
    if (!res.ok) throw new Error(`notebook-voice ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Transcribe the first recording and fill in whatever it already answers.
// Resolves the updated row, or null if the AI couldn't (then every question
// is simply asked).
export async function analyzeEntry(id) {
  await freshSession()
  try {
    const out = await callVoice({ action: 'analyze', entry_id: id })
    return out?.entry || null
  } catch (err) {
    console.warn('[EN Helper] analyze failed, asking every question:', err.message)
    return null
  }
}

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// One spoken answer: { text, option }. text is empty when nothing was heard.
export async function answerByVoice(id, question, options, audioBlob) {
  await freshSession()
  return callVoice({
    action: 'answer',
    entry_id: id,
    question,
    options: options || [],
    audio: toBase64(await audioBlob.arrayBuffer()),
  })
}

// Write answers to the row. Resolves the row as saved.
export async function patchEntry(id, patch) {
  await freshSession()
  const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?id=eq.${id}`, {
    method: 'PATCH',
    headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`save ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return (await res.json())[0]
}

export async function loadEntry(id) {
  const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?id=eq.${id}&select=*`, { headers: restHeaders() })
  return res.ok ? (await res.json())[0] || null : null
}

// Every question answered: mark it complete, which is what makes it count,
// win the meeting's attendance back, and get written up. Resolves { claimed }.
export async function finishEntry(entry, scope) {
  await patchEntry(entry.id, { complete: true })
  callVoice({ action: 'finish', entry_id: entry.id }, { keepalive: true }).catch(() => {})
  const claimed = await claimNotebookAttendance(entry.username, entry.meeting_date, scope)
  return { claimed }
}

// This student's voice entries that still have questions left.
export async function unfinishedEntries(username, scope) {
  try {
    const q = `${scope}&username=eq.${encodeURIComponent(username)}&source=eq.voice&complete=eq.false` +
      '&select=*&order=created_at.desc&limit=5'
    const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?${q}`, { headers: restHeaders() })
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}

// What the project and mentor questions offer: this team's active projects,
// and its mentors and coaches (the same lists as the typed form).
export async function questionContext(scope) {
  const h = restHeaders()
  const [projects, people] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/notebook_projects?${scope}&status=eq.Active&select=id,name,category&order=created_at.desc`, { headers: h })
      .then(r => (r.ok ? r.json() : [])).catch(() => []),
    fetch(`${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=display_name,function_tags&order=display_name`, { headers: h })
      .then(r => (r.ok ? r.json() : [])).catch(() => []),
  ])
  return {
    projects: projects || [],
    mentors: (people || [])
      .filter(r => (r.function_tags || []).some(t => t === 'Mentor' || t === 'Coach'))
      .map(r => r.display_name)
      .filter(Boolean),
  }
}

// Entries the AI hasn't finished a few minutes on. Nudged again when the
// student opens the Helper, so a missed nudge never depends on the scheduler.
export async function nudgeUnfinished(username, scope) {
  try {
    const since = new Date(Date.now() - 2 * 60_000).toISOString()
    const q = `${scope}&username=eq.${encodeURIComponent(username)}&source=eq.voice` +
      `&complete=eq.true&ai_status=in.(pending,failed)&ai_attempts=lt.5&created_at=lt.${since}&select=id&limit=3`
    const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?${q}`, { headers: restHeaders() })
    if (!res.ok) return
    for (const row of await res.json()) requestProcessing(row.id)
  } catch { /* the scheduler covers it */ }
}

export async function latestVoiceEntry(username, scope) {
  try {
    const q = `${scope}&username=eq.${encodeURIComponent(username)}&source=eq.voice` +
      '&complete=eq.true&select=id,meeting_date,ai_status,polished,transcript,created_at&order=created_at.desc&limit=1'
    const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?${q}`, { headers: restHeaders() })
    return res.ok ? (await res.json())[0] || null : null
  } catch {
    return null
  }
}
