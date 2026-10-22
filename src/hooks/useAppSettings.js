import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'

// Global, team-wide app settings (one JSON doc, no new table needed).
const DOC_ID = 'app_settings'
const DEFAULTS = { teamPulseEnabled: true }

export function useAppSettings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const ref = useRef(DEFAULTS)
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders({ 'Content-Type': 'application/json' })

  const apply = (data) => { const merged = { ...DEFAULTS, ...(data || {}) }; ref.current = merged; setSettings(merged) }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${DOC_ID}&select=data`, { headers })
        if (res.ok) { const rows = await res.json(); apply(rows?.[0]?.data) }
      } catch { /* ignore */ }
    })()
    const ch = supabase
      .channel('app-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === DOC_ID) apply(p.new.data)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = useCallback(async (patch) => {
    const next = { ...ref.current, ...patch }
    apply(next)
    try {
      await fetch(`${url}/rest/v1/scouting_schedule`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
        body: JSON.stringify({ id: DOC_ID, data: next }),
      })
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { settings, updateSettings }
}
