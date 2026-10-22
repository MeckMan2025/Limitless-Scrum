// A notice filed inside the 24 hours still gets filed — telling people late is
// better than not telling them, and the rule already handles the consequence
// (it counts absent regardless). What it shouldn't do is arrive silently: a
// late notice is the one a lead needs to see *before* the meeting, because
// it's the one they haven't planned around.

import { triggerPush } from '../utils/pushHelper'
import { storedTeamScope } from '../lib/teamScope'
import { lazyHeadersWith } from '../lib/restHeaders'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = lazyHeadersWith({ 'Content-Type': 'application/json' })

// Leads and co-leads — the people who run a meeting and take attendance at it.
// Mentors and Coaches are deliberately not here: they carry a lead tag for
// permissions, but they aren't the ones re-planning a session around who
// turned up, and a ping for every late notice would be noise to them.
const NOTIFY_TAGS = [
  'Co-Founder',
  'Project Manager', 'Business Lead', 'Technical Lead', 'Programming Lead',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead',
]

const prettyDay = (d) => {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  } catch { return d }
}

// Fire-and-forget: never let a notification failure stop the notice itself
// from being filed. The notice is the thing that matters.
export async function alertLeadsOfLateNotice({ actor, date, hoursBefore, outAll, reason, arriveAt, leaveAt }) {
  try {
    const res = await fetch(`${REST_URL}/rest/v1/profiles?${storedTeamScope()}&select=id,display_name,function_tags`, { headers: HEADERS })
    if (!res.ok) return

    const hrs = Math.max(0, Math.round((hoursBefore || 0) * 10) / 10)
    const when = outAll
      ? 'out for the whole meeting'
      : `in ${arriveAt || '?'}–${leaveAt || '?'}`
    const body =
      `${actor} filed ${hrs}h before ${prettyDay(date)} — under 24, so it counts absent. ` +
      `${when}. Reason: "${reason}"`

    for (const p of await res.json()) {
      if (p.display_name === actor) continue
      if (!(p.function_tags || []).some(t => NOTIFY_TAGS.includes(t))) continue
      const notif = {
        id: String(Date.now()) + Math.random().toString(36).slice(2) + p.id.slice(0, 4),
        user_id: p.id,
        type: 'late_absence_notice',
        title: '⏰ Late absence notice',
        body,
      }
      await fetch(`${REST_URL}/rest/v1/notifications`, { method: 'POST', headers: HEADERS, body: JSON.stringify(notif) })
      triggerPush(notif)
    }
  } catch { /* best-effort */ }
}
