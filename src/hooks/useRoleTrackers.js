import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { SEED_TRACKERS, SEED_VERSION, RETIRED_SEED_IDS } from '../data/roleTrackers'

// All role trackers live in one JSON doc (scouting_schedule row id='role_trackers')
// so the feature needs no new table or migration. Anon REST + realtime.
const DOC_ID = 'role_trackers'

export function useRoleTrackers() {
  const [trackers, setTrackers] = useState(null) // null = loading
  const ref = useRef([])
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders({ 'Content-Type': 'application/json' })

  const apply = (list) => { ref.current = list; setTrackers(list) }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${DOC_ID}&select=data`, { headers })
        if (res.ok) {
          const rows = await res.json()
          const saved = rows?.[0]?.data?.trackers
          if (!Array.isArray(saved) || !saved.length) { apply(SEED_TRACKERS); return }

          // Strip withdrawn seeds every load — a doc that already saved one would
          // otherwise keep it forever.
          let next = saved.filter(t => !RETIRED_SEED_IDS.includes(t.id))
          let changed = next.length !== saved.length

          // Backfill fields added to a seed after the doc was written (icons, for
          // one). The id merge only appends new trackers, so existing rows would
          // otherwise never pick these up. Never overwrites a value someone set.
          const seedById = new Map(SEED_TRACKERS.map(t => [t.id, t]))
          next = next.map(t => {
            const seed = seedById.get(t.id)
            if (seed?.icon && !t.icon) { changed = true; return { ...t, icon: seed.icon } }
            return t
          })

          // Append seeds added since the doc was last written, once.
          const savedVersion = rows?.[0]?.data?.seedVersion || 1
          if (savedVersion < SEED_VERSION) {
            const have = new Set(next.map(t => t.id))
            const additions = SEED_TRACKERS.filter(t => !have.has(t.id))
            if (additions.length) { next = [...next, ...additions]; changed = true }
          }

          apply(next)
          // Write back so the merge, the removals, and the new seedVersion stick.
          if (changed || savedVersion < SEED_VERSION) persist(next)
        } else apply(SEED_TRACKERS)
      } catch { apply(SEED_TRACKERS) }
    })()
    const ch = supabase
      .channel('role-trackers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === DOC_ID && Array.isArray(p.new?.data?.trackers)) apply(p.new.data.trackers)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (next) => {
    apply(next)
    try {
      await fetch(`${url}/rest/v1/scouting_schedule`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
        body: JSON.stringify({ id: DOC_ID, data: { trackers: next, seedVersion: SEED_VERSION } }),
      })
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const upsertTracker = useCallback((tr) => {
    const cur = ref.current
    const next = cur.some(t => t.id === tr.id) ? cur.map(t => (t.id === tr.id ? tr : t)) : [...cur, tr]
    persist(next)
  }, [persist])

  const removeTracker = useCallback((id) => {
    persist(ref.current.filter(t => t.id !== id))
  }, [persist])

  return { trackers: trackers || [], loading: trackers === null, upsertTracker, removeTracker }
}
