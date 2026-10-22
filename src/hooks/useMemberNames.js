import { useState, useEffect } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders, ensureUserToken } from '../lib/restHeaders'
import { excludedFromAttendance } from '../lib/attendanceRoster'

// The team roster, for dropdowns. One shared source so every "pick a person"
// control agrees with RadMems instead of relying on typed names.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// forEvent: who is never put on an event rota — the mentors and coaches (they
// run the day, they are not dealt a job on it) and the shared ETS account,
// which is not a person. The same rule attendance uses, so the two never
// disagree about who counts. Only the event pickers ask for this; the task
// assignee list still shows everyone.
export function useMemberNames({ forEvent = false } = {}) {
  const [names, setNames] = useState([])

  // Wait for a real token before asking.
  //
  // The database gives an unauthenticated request nothing — not an error, an
  // empty list — so a roster fetched a moment too early comes back as zero
  // people and the picker says "no roster found" with no way to recover but a
  // reload. Which is exactly what people were doing.
  //
  // ensureUserToken waits for the session, refreshing it if it has gone stale,
  // and the empty result is retried rather than kept: an empty roster is
  // almost always a timing problem, and a team with genuinely nobody in it
  // loses nothing by being asked twice.
  useEffect(() => {
    let active = true
    ;(async () => {
      for (let attempt = 0; attempt < 3 && active; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, 800))
        try {
          await ensureUserToken()
          const res = await fetch(
            `${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=display_name,function_tags&order=display_name`,
            { headers: restHeaders() }
          )
          if (!res.ok || !active) continue
          const rows = await res.json()
          const people = (Array.isArray(rows) ? rows : [])
            .filter(r => !(r.function_tags || []).includes('Team')) // team accounts aren't people
            .filter(r => !forEvent || !excludedFromAttendance(r))
            .map(r => r.display_name)
            .filter(Boolean)
          if (!active) return
          if (people.length) { setNames(people); return }
        } catch { /* try again */ }
      }
    })()
    return () => { active = false }
  }, [forEvent])

  return names
}

// Just the mentors and coaches (as set in User Management) — for the "who to
// ask for help" mentor picker, so it isn't the whole team.
export function useMentorNames() {
  const [names, setNames] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        await ensureUserToken()
        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=display_name,function_tags&order=display_name`,
          { headers: restHeaders() }
        )
        if (!res.ok || !active) return
        const rows = await res.json()
        setNames(
          (Array.isArray(rows) ? rows : [])
            .filter(r => {
              const t = r.function_tags || []
              return t.includes('Mentor') || t.includes('Coach')
            })
            .map(r => r.display_name)
            .filter(Boolean)
        )
      } catch { /* ignore */ }
    })()
    return () => { active = false }
  }, [])

  return names
}
