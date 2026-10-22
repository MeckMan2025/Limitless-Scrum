import { useState, useEffect, useMemo } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { GraduationCap } from 'lucide-react'
import { prettyDate } from './logForm'
import { ACTIVE_SEASON, seasonOf } from '../data/season'
import { teamScope } from '../lib/teamScope'

// No table of its own. Every notebook entry already answers whether a mentor
// helped, who it was and what with — so the mentor log is that answer read
// back. Nothing extra to fill in, and it can't drift from the notebook,
// because it is the notebook.
const COLS = 'id,username,meeting_date,category,custom_category,what_did,' +
  'mentor_help,mentor_name,mentor_note,season,created_at'

export default function MentorLog() {
  const { username } = useUser()
  const { canOrganizeNotebook: isLead, myTeamNumber } = usePermissions()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState(ACTIVE_SEASON)
  const [mentor, setMentor] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/notebook_entries?select=${COLS}&${teamScope(myTeamNumber)}&mentor_help=is.true&order=meeting_date.desc,created_at.desc`,
          { headers: restHeaders() },
        )
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        if (alive) setEntries(data)
      } catch (err) {
        console.error('Failed to load mentor help:', err)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line

  // The same rule the notebook applies to itself: your own entries unless you
  // are a lead. This reads notebook entries, so it must not be looser than the
  // notebook is.
  const visible = useMemo(() => {
    const mine = isLead ? entries : entries.filter(e => e.username === username)
    return mine.filter(e => seasonOf(e) === season)
  }, [entries, isLead, username, season])

  const rows = useMemo(
    () => (mentor ? visible.filter(e => (e.mentor_name || 'Unnamed') === mentor) : visible),
    [visible, mentor],
  )

  const seasons = useMemo(() => {
    const set = new Set([ACTIVE_SEASON])
    entries.forEach(e => set.add(seasonOf(e)))
    return Array.from(set).sort().reverse()
  }, [entries])

  // Who helped and how often — the summary anyone actually wants from this.
  const byMentor = useMemo(() => {
    const counts = new Map()
    visible.forEach(e => {
      const name = e.mentor_name || 'Unnamed'
      counts.set(name, (counts.get(name) || 0) + 1)
    })
    return Array.from(counts).sort((a, b) => b[1] - a[1])
  }, [visible])

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 text-gray-200">
          <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
            Mentor Log
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {visible.length} {visible.length === 1 ? 'time' : 'times'} a mentor helped
            {!isLead && ' you'} · straight from the engineering notebook
          </p>

          <div className="mt-2 flex items-center gap-2 flex-wrap text-gray-200">
            <select
              value={season}
              onChange={e => setSeason(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            >
              {seasons.map(s => (
                <option key={s} value={s}>{s}{s === ACTIVE_SEASON ? ' (current)' : ' — archive'}</option>
              ))}
            </select>
            {byMentor.length > 1 && (
              <select
                value={mentor}
                onChange={e => setMentor(e.target.value)}
                className="border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              >
                <option value="">Every mentor</option>
                {byMentor.map(([name]) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <GraduationCap size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No mentor help logged this season.</p>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                This fills itself in — every notebook entry that says a mentor
                helped shows up here.
              </p>
            </div>
          ) : (
            <>
              {/* Who helped, at a glance. */}
              {byMentor.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Mentors this season</p>
                  <div className="flex flex-wrap gap-1.5">
                    {byMentor.map(([name, count]) => (
                      <button
                        key={name}
                        onClick={() => setMentor(mentor === name ? '' : name)}
                        className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                          mentor === name
                            ? 'bg-brand-yellow text-gray-800'
                            : 'bg-brand-blue/25 hover:bg-brand-blue/45 text-gray-600'
                        }`}
                      >
                        {name} · {count}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rows.map(e => (
                <div key={e.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 flex items-center gap-1.5">
                        <GraduationCap size={14} className="text-amber-500 shrink-0" />
                        {e.mentor_name || 'Unnamed mentor'}
                      </p>
                      {e.mentor_note && (
                        <p className="text-sm text-gray-600 mt-1">{e.mentor_note}</p>
                      )}
                      {/* What the entry was about, so the help has context
                          without having to go and find the entry. */}
                      <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{e.what_did}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400 whitespace-nowrap">{prettyDate(e.meeting_date)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {e.category === 'Custom' ? (e.custom_category || 'Custom') : e.category}
                      </p>
                      {isLead && <p className="text-[11px] text-gray-400 mt-0.5">{e.username}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
