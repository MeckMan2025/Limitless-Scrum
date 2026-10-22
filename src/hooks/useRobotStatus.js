import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'

// Robot build status — one JSON doc (scouting_schedule row id='robot_status'),
// shared by every hardware role (CAD, Assembly/Building, Wiring). One robot,
// one board.
//
// Shape:
//   priority    string                          — what we're building right now
//   deadline    { label, date:'YYYY-MM-DD' }    — next hard deadline
//   blocked     [{ id, text, by, at }]          — what's stuck and why
//   subsystems  [{ id, name, emoji, status }]   — status: 'todo' | 'building' | 'testing' | 'redesign' | 'ready'
const DOC_ID = 'robot_status'

const EMPTY = {
  priority: '',
  deadline: { label: '', date: '' },
  blocked: [],
  subsystems: [
    { id: 'sub-drive', name: 'Drivetrain', emoji: '🛞', status: 'todo' },
    { id: 'sub-intake', name: 'Intake', emoji: '🦾', status: 'todo' },
    { id: 'sub-climb', name: 'Climber', emoji: '🧗', status: 'todo' },
    { id: 'sub-elec', name: 'Electronics', emoji: '⚡', status: 'todo' },
  ],
}

export function useRobotStatus() {
  const [doc, setDoc] = useState(null) // null = loading
  const ref = useRef(EMPTY)
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders({ 'Content-Type': 'application/json' })

  const apply = (d) => { ref.current = d; setDoc(d) }

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
      .channel('robot-status')
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

  return { robot: doc || EMPTY, loading: doc === null, update }
}
