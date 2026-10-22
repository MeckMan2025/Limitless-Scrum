// A co-lead acts directly on things a member would have had to request. The
// lead they share the job with should still hear about it — not to approve it
// after the fact, but so nobody is surprised by a decision made on their side.

import { triggerPush } from '../utils/pushHelper'
import { storedTeamScope } from '../lib/teamScope'
import { lazyHeadersWith } from '../lib/restHeaders'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = lazyHeadersWith({ 'Content-Type': 'application/json' })

// Each co-lead reports to the lead holding the same job.
export const CO_LEAD_PAIRS = {
  'Co-Project Manager': 'Project Manager',
  'Co-Business Lead': 'Business Lead',
  'Co-Technical Lead': 'Technical Lead',
  'Co-Programming Lead': 'Programming Lead',
}

export const coLeadTagsOf = (tags) => (tags || []).filter(t => CO_LEAD_PAIRS[t])
export const isCoLead = (tags) => coLeadTagsOf(tags).length > 0

const WHAT = {
  calendar_event: 'added a calendar event',
  board: 'made a new board',
  task: 'created a task',
  expense: 'logged an expense',
  role_request: 'changed a role',
  default: 'made a change',
}

// Fire-and-forget. `tags` is the actor's own function_tags; if they're not a
// co-lead this does nothing, so callers don't need to check first.
export async function notifyLeadOfCoLeadAction({ actor, tags, type, detail }) {
  const coTags = coLeadTagsOf(tags)
  if (coTags.length === 0) return
  const leadTags = coTags.map(t => CO_LEAD_PAIRS[t])
  try {
    const res = await fetch(`${REST_URL}/rest/v1/profiles?${storedTeamScope()}&select=id,display_name,function_tags`, { headers: HEADERS })
    if (!res.ok) return
    for (const p of await res.json()) {
      if (p.display_name === actor) continue
      if (!(p.function_tags || []).some(t => leadTags.includes(t))) continue
      const notif = {
        id: String(Date.now()) + Math.random().toString(36).slice(2) + p.id.slice(0, 4),
        user_id: p.id,
        type: 'co_lead_action',
        title: '👀 Your co-lead made a change',
        body: `${actor} ${WHAT[type] || WHAT.default}${detail ? `: "${detail}"` : ''}`,
      }
      await fetch(`${REST_URL}/rest/v1/notifications`, { method: 'POST', headers: HEADERS, body: JSON.stringify(notif) })
      triggerPush(notif)
    }
  } catch { /* best-effort — never block the action itself */ }
}
