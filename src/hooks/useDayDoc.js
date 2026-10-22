import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { restHeaders, ensureUserToken } from '../lib/restHeaders'
import { storedTeamScope } from '../lib/teamScope'

// One scouting day's setup document, kept current. Null until it has loaded
// or when there is no such day. Pass null for no day at all.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

export function useDayDoc(scheduleId) {
  const [doc, setDoc] = useState(null)

  useEffect(() => {
    setDoc(null)
    if (!scheduleId) return
    let active = true
    const load = async () => {
      try {
        await ensureUserToken()   // the public key sees no documents
        const res = await fetch(
          `${supabaseUrl}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${encodeURIComponent(scheduleId)}&select=data`,
          { headers: restHeaders() }
        )
        if (!res.ok) return
        const rows = await res.json()
        if (!active) return
        if (rows?.[0]?.data) { setDoc(rows[0].data); return true }
        setDoc({})
      } catch { /* the next change reloads it */ }
      return false
    }
    // A missing document on a cold start is usually a token that was not
    // ready, not a day with no setup. Ask again before believing it.
    ;(async () => {
      for (let attempt = 0; attempt < 3 && active; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, 800))
        if (await load()) return
      }
    })()
    const channel = supabase
      .channel(`day-doc-${scheduleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (payload) => {
        if (payload.new?.id === scheduleId && payload.new?.data) setDoc(payload.new.data)
      })
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [scheduleId])

  return doc
}
