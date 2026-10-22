import { useState, useEffect, useRef, useCallback } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { lazyHeadersWith } from '../lib/restHeaders'
import { supabase } from '../supabase'

// Season goals + which entry/task maps to which goal. One JSON doc, no schema change.
//   data = { goals: [{ id, name }], entryGoal: { [entryId]: goalId }, taskGoal: { [taskId]: goalId } }
const DOC_ID = 'season_goals'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })
const uid = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function useGoals() {
  const [data, setData] = useState({ goals: [], entryGoal: {}, taskGoal: {} })
  const ref = useRef({ goals: [], entryGoal: {}, taskGoal: {} })
  const apply = (d) => {
    const merged = { goals: (d && d.goals) || [], entryGoal: (d && d.entryGoal) || {}, taskGoal: (d && d.taskGoal) || {} }
    ref.current = merged
    setData(merged)
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${DOC_ID}&select=data`, { headers })
        if (res.ok) { const rows = await res.json(); apply(rows?.[0]?.data) }
      } catch { /* ignore */ }
    })()
    const ch = supabase
      .channel('season-goals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === DOC_ID) apply(p.new.data)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const persist = useCallback(async (next) => {
    apply(next)
    try {
      await fetch(`${url}/rest/v1/scouting_schedule`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
        body: JSON.stringify({ id: DOC_ID, data: next }),
      })
    } catch { /* ignore */ }
  }, [])

  const addGoal = useCallback((name) => {
    const n = (name || '').trim()
    if (!n) return null
    const g = { id: uid(), name: n }
    persist({ ...ref.current, goals: [...ref.current.goals, g] })
    return g.id
  }, [persist])

  const removeGoal = useCallback((id) => {
    persist({ ...ref.current, goals: ref.current.goals.filter(g => g.id !== id) })
  }, [persist])

  const setEntryGoal = useCallback((entryId, goalId) => {
    const eg = { ...ref.current.entryGoal }
    if (goalId) eg[entryId] = goalId; else delete eg[entryId]
    persist({ ...ref.current, entryGoal: eg })
  }, [persist])

  const setTaskGoal = useCallback((taskId, goalId) => {
    const tg = { ...ref.current.taskGoal }
    if (goalId) tg[taskId] = goalId; else delete tg[taskId]
    persist({ ...ref.current, taskGoal: tg })
  }, [persist])

  return { goals: data.goals, entryGoal: data.entryGoal, taskGoal: data.taskGoal, addGoal, removeGoal, setEntryGoal, setTaskGoal }
}
