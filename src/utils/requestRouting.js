import { triggerPush } from './pushHelper'
import { storedTeamScope } from '../lib/teamScope'
import { lazyHeadersWith } from '../lib/restHeaders'

// Route a freshly submitted request to the people who actually review that
// kind of request — money asks go to Finance, everything else to the leads.
// Without this, requests sat silently until a reviewer happened to open the
// bell.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

const LEAD_TAGS = ['Co-Founder', 'Mentor', 'Coach', 'Project Manager', 'Business Lead', 'Technical Lead', 'Programming Lead',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead']
const FULL_LEADS = ['Co-Founder', 'Mentor', 'Coach', 'Project Manager']

const LABELS = {
  expense: 'an expense',
  calendar_event: 'a calendar event',
  board: 'a new board',
  task: 'a task',
  leave_task: 'to leave a task',
  role_request: 'a role',
}

// Who reviews what:
//   expense               -> Finance role + Business Lead + whole-team leads
//   everything else       -> any lead (meetings/boards/roles are lead business)
const matchers = {
  expense: (tags) => tags.includes('Finance') || tags.includes('Business Lead') || FULL_LEADS.some(t => tags.includes(t)),
  default: (tags) => LEAD_TAGS.some(t => tags.includes(t)),
}

export async function notifyRequestReviewers(request) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=id,function_tags`, { headers })
    if (!res.ok) return
    const match = matchers[request.type] || matchers.default
    for (const p of await res.json()) {
      if (p.id === request.requested_by_user_id) continue
      if (!match(p.function_tags || [])) continue
      const notif = {
        id: String(Date.now()) + Math.random().toString(36).slice(2) + p.id.slice(0, 4),
        user_id: p.id,
        type: 'request_submitted',
        title: '📥 New request to review',
        body: `${request.requested_by} requested ${LABELS[request.type] || 'something'}${request.data?.title || request.data?.name || request.data?.role ? `: "${request.data.title || request.data.name || request.data.role}"` : ''}`,
      }
      await fetch(`${supabaseUrl}/rest/v1/notifications`, { method: 'POST', headers, body: JSON.stringify(notif) })
      triggerPush(notif)
    }
  } catch { /* best-effort */ }
}
