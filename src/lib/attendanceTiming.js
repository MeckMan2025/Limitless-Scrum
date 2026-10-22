// How much of a meeting somebody was actually there for.
//
// A record carries its own minutes: late_min, early_min and whether each was
// excused, next to its status. A session carries duration_min when a lead has
// said how long it ran. This file is the arithmetic on those columns and the
// one or two writes that change them.
//
// It replaces a single JSON document that held every person's minutes for
// every meeting (supabase/attendance_timing.sql says why that kept losing
// people's time). Nothing reads that document any more.

import { lazyHeadersWith, lazyRestHeaders } from './restHeaders'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_HEADERS = lazyRestHeaders
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json', Prefer: 'return=minimal' })

export const DEFAULT_DURATION = 240

// When a meeting starts, when the calendar doesn't say. Saturdays run from the
// morning; weeknights start after school. One place, because the absence form,
// the attendance maths and anything else asking all have to agree — a wrong
// start time turns into wrong minutes-late for everybody.
export function defaultStartForDate(sessionDate) {
  if (!sessionDate) return '16:00'
  return weekdayOf(sessionDate) === 6 ? '09:00' : '16:00'
}

// Automatic meeting length until a lead overrides it. Saturdays run 9–2, so
// 300 minutes; weeknights are 4–8, so 240. This is the number every
// late/left-early percentage is measured against — if it disagrees with the
// hours the meeting actually ran, everyone's attendance comes out wrong.
export function defaultDurationForDate(sessionDate) {
  if (!sessionDate) return DEFAULT_DURATION
  const day = weekdayOf(sessionDate)
  return (day === 0 || day === 6) ? 300 : 240
}

// 0 = Sunday … 6 = Saturday, from a 'YYYY-MM-DD' string, in local time.
export function weekdayOf(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay()
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Minutes a session ran: what the lead typed, or the usual for that day.
export function sessionDuration(session) {
  const d = Number(session?.duration_min)
  return d > 0 ? d : defaultDurationForDate(session?.session_date)
}

// The four timing fields off a record, in the names the screens use. null
// means nobody has written anything, which is different from 0: a blank is
// something a filed notice may fill in, a 0 is a lead's answer.
export function recordTiming(record) {
  return {
    lateMin: record?.late_min ?? null,
    earlyMin: record?.early_min ?? null,
    lateExcused: record?.late_excused ?? null,
    earlyExcused: record?.early_excused ?? null,
  }
}

// Has anyone (a lead, or a notice) written timing on this record yet?
export function timingTouched(record) {
  return record?.late_min != null || record?.early_min != null
    || record?.late_excused != null || record?.early_excused != null
}

// % of the meeting a person was actually present. Counts ALL missed time
// (late + early), whether excused or not — excused is only a label.
export function presencePct(record, session) {
  if (record?.status !== 'present') return 0
  const dur = sessionDuration(session)
  const missed = Math.max(0, (Number(record.late_min) || 0) + (Number(record.early_min) || 0))
  return Math.max(0, Math.min(100, Math.round(((dur - missed) / dur) * 100)))
}

// Unexcused missed minutes (for a "how much did they skip without an excuse" view)
export function unexcusedMissed(record) {
  return (record?.late_excused ? 0 : (Number(record?.late_min) || 0))
    + (record?.early_excused ? 0 : (Number(record?.early_min) || 0))
}

// "late 65m (exc) · left 90m" — or '' when there is nothing to say.
export function timingLabel(record) {
  const t = recordTiming(record)
  const tag = (mins, exc, label) => mins ? `${label} ${mins}m${exc ? ' (exc)' : ''}` : ''
  return [tag(t.lateMin, t.lateExcused, 'late'), tag(t.earlyMin, t.earlyExcused, 'left')].filter(Boolean).join(' · ')
}

// ── From a window of hours to minutes missed ────────────────────────────────

const toMinutes = (hhmm) => {
  if (!hhmm) return null
  const [h, m] = String(hhmm).split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}

// "There 4:00 to 6:30" on a Thursday is 0 late and 90 early. Measured against
// the day's usual start and the session's length, the way the notice form
// shows it as people type.
export function windowMinutes(sessionDate, arriveAt, leaveAt, durationMin) {
  const start = toMinutes(defaultStartForDate(sessionDate))
  const end = start + (Number(durationMin) > 0 ? Number(durationMin) : defaultDurationForDate(sessionDate))
  const a = toMinutes(arriveAt)
  const l = toMinutes(leaveAt)
  return {
    late: a == null ? 0 : Math.max(0, a - start),
    early: l == null ? 0 : Math.max(0, end - l),
  }
}

// What a person's record should carry, from what they filed.
//
// A notice for that exact day wins: "I'm out this Thursday" overrides "I leave
// early on Thursdays". Otherwise a standing notice for that weekday applies.
// Returns the columns to write, or null when there is nothing filed (or the
// filing says they'll be there the whole time).
//
// A notice filed in time has its minutes excused; a late one doesn't. A
// standing notice is in time by definition, so it is always excused.
export function filedTiming({ sessionDate, username, notices = [], standing = [], durationMin }) {
  const n = notices.find(x => x.username === username && String(x.meeting_date) === sessionDate)
  if (n) {
    if (n.kind !== 'partial') return null
    const late = Number(n.late_min) || 0
    const early = Number(n.early_min) || 0
    if (!late && !early) return null
    return { late_min: late, early_min: early, late_excused: !!n.on_time, early_excused: !!n.on_time, source: 'notice' }
  }
  const s = standingFor(username, sessionDate, standing)
  if (!s || s.kind !== 'partial') return null
  const { late, early } = windowMinutes(sessionDate, s.arrive_at, s.leave_at, durationMin)
  if (!late && !early) return null
  return { late_min: late, early_min: early, late_excused: true, early_excused: true, source: 'standing' }
}

// The standing notice this person has for the weekday of a date, if any.
export function standingFor(username, sessionDate, standing = []) {
  const wd = weekdayOf(sessionDate)
  return standing.find(x => x.username === username && Number(x.weekday) === wd) || null
}

// Strip the bookkeeping field before writing.
export function timingColumns(t) {
  if (!t) return null
  const { late_min, early_min, late_excused, early_excused } = t
  return { late_min, early_min, late_excused, early_excused }
}

// ── Reads and writes ────────────────────────────────────────────────────────

// Every standing notice for a team. Small table; one read covers every
// session on the screen.
export async function loadStandingNotices(scope) {
  try {
    const res = await fetch(`${REST_URL}/rest/v1/standing_notices?${scope}&select=*&order=weekday`, { headers: REST_HEADERS })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

// Change one record's minutes. `patch` uses the screen names (lateMin,
// earlyMin, lateExcused, earlyExcused) or the column names; either is fine.
export async function saveRecordTiming(recordId, patch) {
  const body = {}
  if ('lateMin' in patch) body.late_min = patch.lateMin
  if ('earlyMin' in patch) body.early_min = patch.earlyMin
  if ('lateExcused' in patch) body.late_excused = patch.lateExcused
  if ('earlyExcused' in patch) body.early_excused = patch.earlyExcused
  for (const k of ['late_min', 'early_min', 'late_excused', 'early_excused']) {
    if (k in patch) body[k] = patch[k]
  }
  const res = await fetch(`${REST_URL}/rest/v1/attendance_records?id=eq.${encodeURIComponent(recordId)}`, {
    method: 'PATCH', headers: REST_JSON, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return body
}

// The same patch, in record shape, for updating local state before the
// server answers.
export function applyTimingPatch(record, patch) {
  const next = { ...record }
  if ('lateMin' in patch) next.late_min = patch.lateMin
  if ('earlyMin' in patch) next.early_min = patch.earlyMin
  if ('lateExcused' in patch) next.late_excused = patch.lateExcused
  if ('earlyExcused' in patch) next.early_excused = patch.earlyExcused
  for (const k of ['late_min', 'early_min', 'late_excused', 'early_excused']) {
    if (k in patch) next[k] = patch[k]
  }
  return next
}

// How long a meeting ran. Empty or 0 goes back to the usual length.
export async function saveSessionDuration(sessionId, min) {
  const n = Number(min)
  const duration_min = n > 0 ? Math.round(n) : null
  const res = await fetch(`${REST_URL}/rest/v1/attendance_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: 'PATCH', headers: REST_JSON, body: JSON.stringify({ duration_min }),
  })
  if (!res.ok) throw new Error(await res.text())
  return duration_min
}
