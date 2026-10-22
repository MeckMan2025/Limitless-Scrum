import { restHeaders } from './restHeaders'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Writing the entry is what wins the meeting back, so it is claimed the moment
// an entry saves rather than waiting for a lead to open the Attendance
// Manager. Only absences the rule handed out (marked_by 'notebook-rule') can
// be claimed: a lead marking someone absent because they weren't there still
// stands.
//
// Shared by the typed form and the EN Helper so the two can never disagree
// about what an entry earns. Resolves true when an absence was turned back to
// present, and never throws: the entry is already saved by the time this runs.
export async function claimNotebookAttendance(username, dateStr, scope) {
  if (!username || !dateStr) return false
  const h = restHeaders()
  try {
    const sRes = await fetch(`${supabaseUrl}/rest/v1/attendance_sessions?${scope}&session_date=eq.${dateStr}&select=id`, { headers: h })
    if (!sRes.ok) return false
    const sessions = await sRes.json()
    if (!sessions.length) return false
    const q = new URLSearchParams({
      session_id: `eq.${sessions[0].id}`,
      username: `eq.${username}`,
      status: 'eq.absent',
      marked_by: 'eq.notebook-rule',
    })
    const res = await fetch(`${supabaseUrl}/rest/v1/attendance_records?${q}`, {
      method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'present', marked_by: username }),
    })
    const rows = res.ok ? await res.json() : []
    return rows.length > 0
  } catch (err) {
    console.error('Failed to claim attendance back:', err)
    return false
  }
}
