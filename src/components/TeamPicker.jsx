import { useState, useEffect } from 'react'
import { lazyHeadersWith } from '../lib/restHeaders'
import { stampStored, storedTeamScope } from '../lib/teamScope'
import { X } from 'lucide-react'

// Pick FRC teams from the shared considered_teams list (the same one RadRank
// manages) instead of typing numbers. Adding a number here inserts it there
// too, so the canonical list grows wherever teams are first encountered.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

export default function TeamPicker({ value = [], onChange, addedBy = '' }) {
  const [teams, setTeams] = useState([]) // [{ team_number, team_name }]
  const [newNum, setNewNum] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/considered_teams?${storedTeamScope('owner_team')}&select=team_number,team_name`, { headers })
        if (!res.ok || !active) return
        const rows = await res.json()
        setTeams((rows || []).sort((a, b) => Number(a.team_number) - Number(b.team_number)))
      } catch { /* ignore */ }
    })()
    return () => { active = false }
  }, [])

  const remaining = teams.filter(t => !value.includes(t.team_number))

  const addNew = async () => {
    const num = newNum.trim().replace(/^#/, '')
    if (!num || !/^\d+$/.test(num)) return
    setNewNum('')
    if (!value.includes(num)) onChange([...value, num])
    if (!teams.some(t => t.team_number === num)) {
      setTeams(prev => [...prev, { team_number: num, team_name: '' }].sort((a, b) => Number(a.team_number) - Number(b.team_number)))
      // Feed the canonical list too (ignore conflicts — it may already exist).
      fetch(`${supabaseUrl}/rest/v1/considered_teams?on_conflict=owner_team,team_number`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates, return=minimal' },
        body: JSON.stringify(stampStored({ team_number: num, added_by: addedBy }, 'owner_team')),
      }).catch(() => {})
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {value.map(num => (
            <span key={num} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-brand-silver/30 text-gray-600 rounded font-mono">
              #{num}
              <button type="button" onClick={() => onChange(value.filter(v => v !== num))} className="hover:text-red-400">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <select
          value=""
          onChange={e => e.target.value && onChange([...value, e.target.value])}
          className="flex-1 min-w-0 text-sm border rounded-lg px-2 py-1 bg-white text-gray-500 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
        >
          <option value="">+ Team…</option>
          {remaining.map(t => (
            <option key={t.team_number} value={t.team_number}>
              #{t.team_number}{t.team_name ? ` — ${t.team_name}` : ''}
            </option>
          ))}
        </select>
        <input
          value={newNum}
          onChange={e => setNewNum(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNew()}
          placeholder="New #"
          className="w-16 text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
        />
      </div>
    </div>
  )
}
