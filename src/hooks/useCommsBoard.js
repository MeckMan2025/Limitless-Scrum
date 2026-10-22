import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'

// Communications board — one JSON doc (scouting_schedule row id='comms_board'),
// same no-table pattern as the finance ledger. Anon REST + realtime.
//
// Shape:
//   queue      [{ id, text, by, at, done }]                     — things that still need communicating
//   drafts     [{ id, title, text, by, at, status, reviewed_by }] — status: 'pending' | 'approved' | 'denied'
//   published  [{ id, text, by, at }]                           — recently published / sent
//   promoted   [event ids]                                       — calendar events already promoted
const DOC_ID = 'comms_board'

const EMPTY = { queue: [], drafts: [], published: [], promoted: [] }

export function useCommsBoard() {
  const [board, setBoard] = useState(null) // null = loading
  const ref = useRef(EMPTY)
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders({ 'Content-Type': 'application/json' })

  const apply = (doc) => { ref.current = doc; setBoard(doc) }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${DOC_ID}&select=data`, { headers })
        if (res.ok) {
          const rows = await res.json()
          const d = rows?.[0]?.data
          apply(d && typeof d === 'object' ? { ...EMPTY, ...d } : EMPTY)
        } else apply(EMPTY)
      } catch { apply(EMPTY) }
    })()
    const ch = supabase
      .channel('comms-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === DOC_ID && p.new?.data) apply({ ...EMPTY, ...p.new.data })
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
        body: JSON.stringify({ id: DOC_ID, data: next }),
      })
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch) => persist({ ...ref.current, ...patch }), [persist])

  return { board: board || EMPTY, loading: board === null, update }
}
