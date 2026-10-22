// What happens when a badge is scanned: that person is present today.
//
// One more way to be present, beside the lead's tap and the notebook rule —
// it marks the record present and leaves a stamp saying when they scanned in.
// The first scan of the day wins; later ones say so and change nothing.

import { lazyHeadersWith, lazyRestHeaders } from './restHeaders'
import { teamScope, stampTeam } from './teamScope'
import { ensureSessionForDate, genId, todayStr } from './attendanceSession'
import { badgeScanCode, normalizeBadge } from './badgeCode'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_HEADERS = lazyRestHeaders
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })

export const SCANNER = 'badge-scanner'

// Resolves to one of
//   { ok: true,  name, code, record, session }            marked present now
//   { ok: true,  name, code, record, session, already }   scanned earlier today
//   { ok: false, error }                                  unknown badge, or the server said no
export async function recordBadgeScan(rawBadge, { username, teamNumber }) {
  const badge = normalizeBadge(rawBadge)
  if (!badge) return { ok: false, error: 'Empty scan' }
  const scope = teamScope(teamNumber)

  let person
  try {
    const res = await fetch(`${REST_URL}/rest/v1/profiles?${scope}&badge_id=eq.${encodeURIComponent(badge)}&select=display_name&limit=1`, { headers: REST_HEADERS })
    if (!res.ok) return { ok: false, error: 'Could not look up badge' }
    person = (await res.json())[0]
  } catch {
    return { ok: false, error: 'Could not look up badge' }
  }
  if (!person?.display_name) return { ok: false, error: `Badge ${badge} not recognised — see a lead` }
  const name = person.display_name

  let session, records
  try {
    ({ session, records } = await ensureSessionForDate({ date: todayStr(), username, teamNumber }))
  } catch (err) {
    return { ok: false, error: err.message || 'Could not open today’s session' }
  }

  const existing = records.find(r => r.username === name)
  if (existing?.badge_scan) {
    return { ok: true, already: true, name, code: existing.badge_scan, record: existing, session }
  }

  const code = badgeScanCode()
  try {
    if (existing) {
      const patch = { status: 'present', marked_by: SCANNER, badge_scan: code }
      const res = await fetch(`${REST_URL}/rest/v1/attendance_records?id=eq.${existing.id}`, {
        method: 'PATCH', headers: REST_JSON, body: JSON.stringify(patch),
      })
      if (!res.ok) return { ok: false, error: 'Could not save the scan: ' + await res.text() }
      return { ok: true, name, code, record: { ...existing, ...patch }, session }
    }
    // Not on today's roster yet — added after the session started, say.
    const record = stampTeam({
      id: genId(),
      session_id: session.id,
      username: name,
      status: 'present',
      marked_by: SCANNER,
      badge_scan: code,
      created_at: new Date().toISOString(),
    }, teamNumber)
    const res = await fetch(`${REST_URL}/rest/v1/attendance_records`, {
      method: 'POST', headers: REST_JSON, body: JSON.stringify(record),
    })
    if (!res.ok) return { ok: false, error: 'Could not save the scan: ' + await res.text() }
    return { ok: true, name, code, record, session }
  } catch (err) {
    return { ok: false, error: 'Could not save the scan: ' + err.message }
  }
}
