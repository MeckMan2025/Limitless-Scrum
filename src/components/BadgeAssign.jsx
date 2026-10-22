import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ScanLine } from 'lucide-react'
import { lazyHeadersWith, lazyRestHeaders } from '../lib/restHeaders'
import { usePermissions } from '../hooks/usePermissions'
import { teamScope } from '../lib/teamScope'
import { excludedFromAttendance } from '../lib/attendanceRoster'
import { normalizeBadge } from '../lib/badgeCode'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_HEADERS = lazyRestHeaders
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })

// Linking each badge to its person. Pick someone, scan their badge (or type
// the number), done. One badge belongs to one person per team; the database
// refuses a second, and we say whose it already is.
export default function BadgeAssign({ onBack }) {
  const { hasLeadTag, myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [people, setPeople] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [assigning, setAssigning] = useState(null)
  const [value, setValue] = useState('')
  const [message, setMessage] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    fetch(`${REST_URL}/rest/v1/profiles?${SCOPE}&select=id,display_name,authority_tier,function_tags,badge_id&order=display_name`, { headers: REST_HEADERS })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then(rows => setPeople(rows.filter(p => p.display_name && p.authority_tier !== 'guest' && !excludedFromAttendance(p))))
      .catch(err => {
        console.error('Failed to load badges:', err)
        setLoadError('Could not load badges. Has supabase/badge_scanner.sql been run?')
      })
  }, [])

  useEffect(() => { if (assigning) inputRef.current?.focus() }, [assigning])

  const save = async (person, raw) => {
    const badge = raw == null ? null : normalizeBadge(raw) || null
    const owner = badge && people.find(p => p.badge_id === badge && p.id !== person.id)
    if (owner) {
      setMessage({ ok: false, text: `Badge ${badge} already belongs to ${owner.display_name}.` })
      return
    }
    const res = await fetch(`${REST_URL}/rest/v1/profiles?id=eq.${person.id}`, {
      method: 'PATCH', headers: REST_JSON, body: JSON.stringify({ badge_id: badge }),
    })
    if (!res.ok) {
      const text = res.status === 409
        ? `Badge ${badge} already belongs to someone else.`
        : 'Could not save: ' + await res.text()
      setMessage({ ok: false, text })
      return
    }
    setPeople(prev => prev.map(p => p.id === person.id ? { ...p, badge_id: badge } : p))
    setMessage({ ok: true, text: badge ? `${person.display_name} → badge ${badge}` : `Cleared ${person.display_name}'s badge` })
    setAssigning(null)
    setValue('')
  }

  if (!hasLeadTag) return null

  const unassigned = people.filter(p => !p.badge_id).length

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="max-w-lg mx-auto space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div>
          <h2 className="text-lg font-bold text-gray-800">Assign Badges</h2>
          <p className="text-xs text-gray-400 mt-1">
            Pick a person, then scan their badge or type its number and press Enter.
            {people.length > 0 && ` ${unassigned} of ${people.length} without a badge.`}
          </p>
        </div>

        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {message && (
          <div className={`text-sm font-medium rounded-lg px-3 py-2 ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-2">
          {people.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">{p.display_name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {p.badge_id
                    ? <span className="font-mono text-xs text-gray-500">{p.badge_id}</span>
                    : <span className="text-xs text-gray-300">no badge</span>}
                  <button
                    onClick={() => { setAssigning(assigning === p.id ? null : p.id); setValue(''); setMessage(null) }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-brand-blue/30 hover:bg-brand-blue/50 text-gray-700 transition-colors"
                  >
                    {p.badge_id ? 'Change' : 'Assign'}
                  </button>
                  {p.badge_id && (
                    <button
                      onClick={() => save(p, null)}
                      className="text-[11px] text-gray-400 hover:text-red-500"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {assigning === p.id && (
                <div className="flex items-center gap-2 mt-2">
                  <ScanLine size={14} className="text-gray-400 shrink-0" />
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) save(p, value) }
                      if (e.key === 'Escape') setAssigning(null)
                    }}
                    placeholder="Scan badge now"
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 text-sm font-mono border rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
