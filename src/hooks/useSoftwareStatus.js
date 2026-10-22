import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'

// Software status — one JSON doc (scouting_schedule row id='software_status'),
// the software twin of robot_status so the technical side feels consistent.
//
// Shape:
//   deadline  { label, date:'YYYY-MM-DD' }
//   auto      'todo' | 'coding' | 'testing' | 'reliable'   — autonomous readiness
//   teleop    same                                          — TeleOp readiness
//   systems   [{ id, name, emoji, status }]                 — status: 'todo' | 'coding' | 'testing' | 'broken' | 'ready'
//   bugs      [{ id, text, by, at }]
//   tasks     [{ id, text, by, at, done }]
const DOC_ID = 'software_status'

const EMPTY = {
  deadline: { label: '', date: '' },
  auto: 'todo',
  teleop: 'todo',
  systems: [
    { id: 'sys-drive', name: 'Drivetrain controls', emoji: '🎮', status: 'todo' },
    { id: 'sys-intake', name: 'Intake controls', emoji: '🦾', status: 'todo' },
    { id: 'sys-auto', name: 'Autonomous pathing', emoji: '🧭', status: 'todo' },
    { id: 'sys-sensors', name: 'Sensors', emoji: '📡', status: 'todo' },
  ],
  bugs: [],
  tasks: [],
}

export function useSoftwareStatus() {
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
      .channel('software-status')
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

  return { software: doc || EMPTY, loading: doc === null, update }
}
