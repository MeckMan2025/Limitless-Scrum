import { useState, useEffect, useMemo } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { teamScope, stampTeam } from '../lib/teamScope'
import { Globe, Plus, X, Loader2, Trash2, Check, Pencil } from 'lucide-react'
import { Field, inputClass as input, todayLocal, prettyDate, newId } from './logForm'

// Individual Contribution isn't asked for — it's members × hours, which holds
// on every row of the sheet this came from (5×3=15, 4×3=12, 5×4=20, 4×4=16,
// 2×3=6). Asking for a number the sheet derives is how the two drift apart, so
// it's worked out here and shown while you type.
const totalHours = (members, hours) => {
  const m = Number(members), h = Number(hours)
  return Number.isFinite(m) && Number.isFinite(h) ? m * h : 0
}

const BLANK = { event_date: todayLocal(), event_name: '', members: '', team_hours: '' }

export default function OutreachLog() {
  const { username } = useUser()
  const { canOrganizeNotebook: isLead, myTeamNumber } = usePermissions()
  // One rule for whose rows these are — see lib/teamScope.js.
  const SCOPE = teamScope(myTeamNumber)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/outreach_log?${SCOPE}&select=*&order=event_date.desc,created_at.desc`,
          { headers },
        )
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        if (alive) setRows(data)
      } catch (err) {
        // The table may not exist yet — reads as empty rather than breaking.
        console.error('Failed to load outreach:', err)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const ready =
    form.event_date &&
    form.event_name.trim() &&
    Number(form.members) > 0 &&
    Number(form.team_hours) > 0

  const preview = totalHours(form.members, form.team_hours)
  const canRemoveAny = rows.some(r => isLead || r.username === username)

  // What the season adds up to — the number outreach actually gets asked for.
  const totals = useMemo(() => ({
    events: rows.length,
    hours: rows.reduce((sum, r) => sum + (Number(r.individual_hours) || 0), 0),
  }), [rows])

  const submit = async () => {
    if (!ready || saving) return
    setSaving(true)
    setError('')
    try {
      const row = {
        id: newId(),
        // Whose row this is. Radical rows stay unstamped, which is NULL.
        ...stampTeam({}, myTeamNumber),
        username,
        event_date: form.event_date,
        event_name: form.event_name.trim(),
        members: Number(form.members),
        team_hours: Number(form.team_hours),
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/outreach_log`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(await res.text())
      // individual_hours is generated in the database, so take the row back
      // rather than computing a second copy of it here.
      const [written] = await res.json().catch(() => [])
      setRows(prev => [written || { ...row, individual_hours: preview }, ...prev])
      setForm({ ...BLANK })
      setShowForm(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to log outreach:', err)
      setError('That didn’t save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    const keep = rows
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/outreach_log?id=eq.${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to remove outreach:', err)
      setRows(keep)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-start justify-between gap-2 text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Outreach Log
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {totals.events} {totals.events === 1 ? 'event' : 'events'} · {totals.hours} member-hours
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-gray-200">
            {/* Deleting lives behind the pencil rather than sitting on every
                row. A bin beside each one is easy to hit by accident, and
                most of the time you are here to read, not to tidy. */}
            {canRemoveAny && (
              <button
                onClick={() => setEditing(v => !v)}
                title={editing ? 'Done' : 'Edit the log'}
                className={`p-1.5 rounded-lg transition-colors ${
                  editing ? 'bg-brand-yellow text-gray-100' : 'text-gray-400 hover:bg-brand-blue/30'
                }`}
              >
                {editing ? <Check size={15} /> : <Pencil size={15} />}
              </button>
            )}
            <button
              onClick={() => { setShowForm(v => !v); setError('') }}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-brand-yellow hover:bg-brand-yellow-dark transition-colors font-medium"
            >
              {showForm ? <><X size={14} /> Close</> : <><Plus size={14} /> Log an event</>}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-3">

          {saved && (
            <div className="flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium">
              <Check size={15} /> Logged.
            </div>
          )}

          {showForm && (
            <div className="space-y-3">
              <Field label="Date" required>
                <input type="date" value={form.event_date}
                       onChange={e => set('event_date', e.target.value)} className={input} />
              </Field>

              <Field label="Event" required>
                <input type="text" value={form.event_name}
                       onChange={e => set('event_name', e.target.value)}
                       placeholder="Flourish and Bots FLL Team Volunteering"
                       className={input} />
              </Field>

              <Field label="Number of Members" required>
                <input type="number" min="1" step="1" value={form.members}
                       onChange={e => set('members', e.target.value)}
                       placeholder="5" className={input} />
              </Field>

              <Field label="Team Contribution (Hours)" required>
                <input type="number" min="0" step="0.5" value={form.team_hours}
                       onChange={e => set('team_hours', e.target.value)}
                       placeholder="3" className={input} />
                <p className="text-xs text-gray-400 mt-2">How long the event ran, per member.</p>
              </Field>

              {/* Read-only: it's the product of the two above, so it can't be
                  typed out of agreement with them. */}
              <div className="bg-brand-blue/20 rounded-xl border border-brand-blue/40 p-4">
                <p className="text-sm font-medium text-gray-700">Individual Contribution (Hours)</p>
                <p className="text-2xl font-semibold text-gray-800 mt-1">{preview || '—'}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {form.members || '—'} members × {form.team_hours || '—'} hours, worked out for you.
                </p>
              </div>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <button
                onClick={submit}
                disabled={!ready || saving}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark disabled:bg-gray-100 disabled:text-gray-400 transition-colors font-medium text-gray-800"
              >
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Submit'}
              </button>
            </div>
          )}

          {!showForm && (
            loading ? (
              <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
            ) : rows.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <Globe size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">Nothing logged yet.</p>
                <p className="text-sm text-gray-400 mt-1">Log an event and it shows up here.</p>
              </div>
            ) : (
              /* Scrolls in its own box — the columns shouldn't push the page
                 sideways on a phone. */
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Event</th>
                      <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Members</th>
                      <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Team hrs</th>
                      <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Individual hrs</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{prettyDate(r.event_date)}</td>
                        <td className="px-3 py-2 text-gray-800">{r.event_name}</td>
                        <td className="px-3 py-2 text-gray-600 text-right">{r.members}</td>
                        <td className="px-3 py-2 text-gray-600 text-right">{r.team_hours}</td>
                        <td className="px-3 py-2 text-gray-800 text-right font-medium">{r.individual_hours}</td>
                        <td className="px-3 py-2 text-right">
                          {editing && (isLead || r.username === username) && (
                            <button
                              onClick={() => remove(r.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors"
                              title="Remove this event"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50/60 text-gray-700">
                      <td className="px-3 py-2 font-semibold" colSpan={4}>Total</td>
                      <td className="px-3 py-2 text-right font-semibold">{totals.hours}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  )
}
