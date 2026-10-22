import { useState, useEffect, useMemo, useRef } from 'react'
import { MATCH_ASSIGNMENTS } from '../data/scoutingGroups'
import { restHeaders } from '../lib/restHeaders'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { Check, Loader2, Trash2, Download, Pencil, ChevronLeft, ChevronRight, ChevronDown, ArrowRight, ArrowLeft } from 'lucide-react'
import {
  SCOUTING_FIELDS, SCOUTING_GROUPS, NUMERIC_FIELDS, FIELD_BY_KEY, EXCLUSIVE_OPTIONS,
  blankEntry, yesNo, displayValue,
} from '../data/scoutingFields'
import { ALL_TEAMS, teamLabel } from '../data/teams'
import { stampTeam, teamScope } from '../lib/teamScope'
import ScoutingSync from './ScoutingSync'
import { useDayDoc } from '../hooks/useDayDoc'
import { takeScoutRequest, announceScoutSaved } from '../lib/scoutHandoff'
import ScoutingHelp, { HelpButton } from './ScoutingHelp'
import { MATCH_HELP, MATCH_SECTION_NOTES } from '../data/scoutingHelp'
import { assignmentsFor, scoutedKeys } from '../lib/dayRota'
import FieldMap from './FieldMap'
import RpIcon from './RpIcon'
import { useAnnounceScouting } from '../hooks/useScoutingPresence'
import { addDraft, addFormDraft, removeDraft, listDrafts, flushDrafts, onDraftsChange, startDraftSender, sendRow, missingColumn } from '../lib/scoutDrafts'

// Match scouting: one row per team per match.
//
// The form, the table, the per-team averages and the CSV all read the same
// field definitions, so a season that changes the game changes one file.

const TABLE = 'match_scouting'


// Ticking an answer in a tick-all list, where some answers cancel the rest.
// "Nothing" and "None" mean "and nothing else", so they clear the other ticks
// and any other tick clears them.
function toggleMulti(picked, opt, on) {
  if (on) return picked.filter(x => x !== opt).join(',')
  if (EXCLUSIVE_OPTIONS.includes(opt)) return opt
  return [...picked.filter(x => !EXCLUSIVE_OPTIONS.includes(x)), opt].join(',')
}

// liveDay: the Competition Day that is live right now, or null. While one is
// live the rota comes from that day's own setup rather than the static list.
// onDone, when given, is called after a successful save: on a live day the
// board is where you go next, not another blank form.
export default function ScoutingForm({ liveDay = null, onDone }) {
  const { username } = useUser()
  const { hasLeadTag, myTeamNumber } = usePermissions()
  const liveDoc = useDayDoc(liveDay ? `day-comp-${liveDay.id}` : null)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  // Opened from the board with a job on it: start on that team and match.
  const [handed] = useState(() => takeScoutRequest())
  const [form, setForm] = useState(() => handed?.team
    ? { ...blankEntry(), team_number: String(handed.team), match_number: handed.match == null ? '' : String(handed.match) }
    : blankEntry())

  // The next match this person is down to scout, and the team they watch in it.
  //
  // Only ever THEIR OWN rota. Filling in somebody else's team because that
  // person has not got round to it would quietly reassign the work and put
  // their name on a row they never watched. The fields stay editable, so
  // covering for somebody who forgot is a deliberate act — you type their team
  // in — rather than something the form decided for you.
  //
  // "Next" is the earliest match of theirs with nothing submitted yet.
  // The live day's match list: which teams play each match. On a live day the
  // match is picked from this list and the team from the four in that match,
  // so a row cannot be saved against a match the team does not play — which
  // is a row the board can never turn green and the averages file under the
  // wrong match.
  const schedule = useMemo(() => {
    const rows = (liveDay && liveDoc?.matchSchedule) || []
    return rows
      .filter(m => String(m.match || '').trim())
      .map(m => ({ match: String(m.match).trim(), teams: ['red1', 'red2', 'blue1', 'blue2'].map(k => String(m[k] || '').trim()).filter(Boolean) }))
      .sort((a, b) => Number(a.match) - Number(b.match))
  }, [liveDay, liveDoc])

  // On a live day: what this person is down for, and what of it is still to do.
  const liveRota = useMemo(() => (liveDay && liveDoc) ? assignmentsFor(liveDoc, username) : null, [liveDay, liveDoc, username])
  const liveLeft = useMemo(() => {
    if (!liveRota) return null
    const done = scoutedKeys(rows)
    return liveRota.filter(a => !done.has(`${a.team}|${a.match}`))
  }, [liveRota, rows])

  const nextAssignment = useMemo(() => {
    if (liveRota) return liveLeft[0] || null
    const first = String(username || '').trim().split(' ')[0].toLowerCase()
    if (!first) return null
    const mine = MATCH_ASSIGNMENTS
      .filter(a => String(a.who || '').toLowerCase() === first)
      .sort((a, b) => Number(a.match) - Number(b.match))
    const done = new Set(rows.map(r => String(r.team_number || '').trim() + '|' + String(r.match_number || '').trim()))
    return mine.find(a => !done.has(a.team + '|' + a.match)) || null
  }, [username, rows, liveRota, liveLeft])

  // Filled in once, while the form is still empty. A form that keeps
  // correcting what you typed is worse than one that never helped.
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !nextAssignment) return
    if (form.team_number || form.match_number) { prefilled.current = true; return }
    prefilled.current = true
    setForm(f => ({ ...f, team_number: nextAssignment.team, match_number: nextAssignment.match }))
  }, [nextAssignment]) // eslint-disable-line
  // The form IS the page — scouting happens at a match, and whoever opens this
  // is here to fill one in, not to read yesterday's. The saved rows are one
  // arrow away.
  const [showData, setShowData] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  // Tell the board which job this form is on, while it is on it.
  useAnnounceScouting(liveDay?.id, (!showData && form.team_number)
    ? { kind: 'match', team: form.team_number, match: form.match_number } : null)
  // One group per screen, the way the notebook asks one thing at a time. The
  // whole form at once is a wall, and a wall gets filled in badly at a
  // competition.
  const [step, setStep] = useState(0)
  // "Other team" — the list is a shortlist, not a fence, and a team that turns
  // up unlisted still has to be scoutable.
  const [otherTeam, setOtherTeam] = useState(() => !!handed?.team && !ALL_TEAMS.some(t => String(t.number) === String(handed.team)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [schemaWarning, setSchemaWarning] = useState('')
  // Entries kept on this phone because they could not be sent yet.
  const [drafts, setDrafts] = useState(() => listDrafts())
  const [sendingDrafts, setSendingDrafts] = useState(false)
  useEffect(() => {
    startDraftSender()
    return onDraftsChange(() => setDrafts(listDrafts()))
  }, [])
  const sendDraftsNow = async () => {
    setSendingDrafts(true)
    try { await flushDrafts() } finally { setSendingDrafts(false); setDrafts(listDrafts()) }
  }
  const [showDrafts, setShowDrafts] = useState(false)
  // Put this form away, as it stands, and start a clean one.
  const saveAsDraft = () => {
    const label = `${form.team_number ? `Team ${form.team_number}` : 'No team'}${form.match_number ? ` · match ${form.match_number}` : ''}`
    addFormDraft(TABLE, form, label)
    setForm(blankEntry())
    setStep(0)
    prefilled.current = false
    setSchemaWarning('Put away as a draft. Open Drafts at the top to come back to it.')
  }
  // Pick an unfinished draft back up, exactly where it was left.
  const resumeDraft = (d) => {
    setForm({ ...blankEntry(), ...d.form })
    prefilled.current = true
    removeDraft(d.id)
    setShowDrafts(false)
    setStep(0)
  }
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [view, setView] = useState('matches')   // matches | teams
  const [teamFilter, setTeamFilter] = useState('')
  // Bumped when rows arrive from another device, to load them.
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/${TABLE}?${teamScope(myTeamNumber, 'owner_team')}&select=*&order=created_at.desc`, { headers })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          // The table doesn't exist until the migration runs. Say so plainly
          // rather than showing an empty page that looks like lost data.
          if (alive && /match_scouting|relation/i.test(body)) setUnavailable(true)
          throw new Error(body)
        }
        const data = await res.json()
        if (alive) setRows(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error('Failed to load scouting:', err)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [reload]) // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Everything is required, so a screen is done when all of its fields are.
  // A screen is done when its required questions are answered. The optional
  // ones — notes, flowers owned, RP points — may be left blank; before this
  // they counted as missing too, so a team that owned no flowers could not be
  // got past without inventing one.
  const filled = (f) => {
    if (!f.required) return true
    const v = form[f.key]
    return v !== '' && v != null
  }
  const groupDone = (g) => SCOUTING_FIELDS.filter(f => f.group === g).every(filled)
  const ready = SCOUTING_FIELDS.every(filled)

  const submit = async () => {
    if (!ready || saving) return
    setSaving(true); setError('')
    try {
      // Whose scouting this is goes in owner_team: team_number is a form
      // field here, the robot being scouted, and overwrote the stamp before.
      const row = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, scout: username, ...stampTeam({}, myTeamNumber, 'owner_team') }
      SCOUTING_FIELDS.forEach(f => {
        const raw = form[f.key]
        if (raw === '' || raw == null) { row[f.key] = null; return }
        row[f.key] = f.type === 'yesno' ? (raw === 'Yes' ? 1 : 0)
          : (f.type === 'number' || f.type === 'scale') ? Number(raw) : String(raw).trim()
      })
      // Save. If the database is behind the form — a column the form writes
      // that nobody has added yet — drop that one answer, say so plainly, and
      // save the rest: a competition does not wait for a migration, and a
      // whole match lost over one new field is worse than one field lost.
      let dropped = []
      let keptAsDraft = false
      try {
        const r = await sendRow(TABLE, row)
        dropped = r.dropped
      } catch (err) {
        // Could not reach the database, or it refused for a reason that is
        // not a missing column. Keep the entry on this phone and move on; it
        // goes up by itself when the connection is back.
        console.error('Save failed, keeping as draft:', err)
        addDraft(TABLE, row)
        keptAsDraft = true
      }
      if (keptAsDraft) {
        setSchemaWarning(`No connection just now, so this match is saved on this phone as a draft. It will send itself when the signal is back, or tap Send drafts at the top.`)
      } else if (dropped.length) {
        const labels = dropped.map(k => FIELD_BY_KEY[k]?.label || k)
        setSchemaWarning(`Saved, but the database has no column for ${labels.join(', ')} yet, so that answer was not kept. A lead needs to run the matching file in supabase/ (${dropped.map(c => c === 'auto_tips' ? 'auto_tips.sql' : c.startsWith('endgame_') ? 'endgame_shot_made.sql' : 'scouting_fields_2026.sql').filter((v, i, a) => a.indexOf(v) === i).join(', ')}) in the Supabase SQL editor.`)
      }
      if (!keptAsDraft) {
        setRows(prev => [{ ...row, created_at: new Date().toISOString() }, ...prev])
        announceScoutSaved()
      }
      setStep(0)
      // Team and match stay: scouting is one team after another in the same
      // match, or the same team match after match. Retyping them every time is
      // the fastest way to put people off doing it.
      setForm({ ...blankEntry(), team_number: form.team_number, match_number: form.match_number })
      // Let the rota offer the next one now this is saved.
      prefilled.current = false
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      onDone?.()
    } catch (err) {
      console.error('Failed to save scouting row:', err)
      // A missing column is not a connection problem, and saying it is sends
      // people off to check their wifi while every save on the team fails.
      // Name the column so a lead knows exactly what the database is short.
      const col = missingColumn(String(err?.message || ''))
      setError(col
        ? `Couldn't save — the database has no "${col}" column yet. Your entry is still here. A lead needs to run the matching file in supabase/ (scouting_fields_2026.sql, endgame_shot_made.sql or auto_tips.sql) in the Supabase SQL editor.`
        : "Couldn't save — your entry is still here. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    const keep = rows
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${TABLE}?id=eq.${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(await res.text())
      announceScoutSaved()   // the board puts "Scout it" back on that job
    } catch (err) {
      console.error('Failed to remove row:', err)
      setRows(keep)
    }
  }

  const teams = useMemo(
    () => Array.from(new Set(rows.map(r => r.team_number).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    [rows])

  const shown = useMemo(
    () => (teamFilter ? rows.filter(r => String(r.team_number) === teamFilter) : rows),
    [rows, teamFilter])

  // Per-team averages. A blank is skipped rather than counted as zero — a scout
  // who didn't see something must not drag a team's average down.
  const byTeam = useMemo(() => teams.map(t => {
    const mine = rows.filter(r => String(r.team_number) === String(t))
    const avg = {}
    NUMERIC_FIELDS.forEach(f => {
      const vals = mine.map(r => f.type === 'yesno' ? yesNo(r[f.key]) : r[f.key]).filter(v => v != null && v !== '')
      const mean = vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null
      // Yes/no averages into the share of matches they did it in.
      avg[f.key] = mean == null ? null
        : f.type === 'yesno' ? `${Math.round(mean * 100)}%`
        : Math.round(mean * 10) / 10
    })
    return { team: t, matches: mine.length, avg }
  }), [teams, rows])

  const exportCsv = () => {
    const cols = ['team_number', 'match_number', ...SCOUTING_FIELDS.map(f => f.key).filter(k => k !== 'team_number' && k !== 'match_number'), 'scout', 'created_at']
    const esc = (v) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [cols.join(','), ...shown.map(r => cols.map(c => esc(FIELD_BY_KEY[c] ? displayValue(FIELD_BY_KEY[c], r[c]) : r[c])).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `scouting-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Frame><p className="text-sm text-gray-400 text-center py-12">Loading…</p></Frame>

  if (unavailable) {
    return (
      <Frame>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <p className="text-gray-600 font-medium">Not set up yet.</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Scouting needs its table before anything can be saved. Run{' '}
            <code className="text-gray-500">supabase/match_scouting.sql</code>, then reload.
          </p>
        </div>
      </Frame>
    )
  }

  const LAST = SCOUTING_GROUPS.length - 1
  const group = SCOUTING_GROUPS[Math.min(step, LAST)]
  const groupFields = SCOUTING_FIELDS.filter(f => f.group === group)
  const missing = groupFields.filter(f => !filled(f)).map(f => f.label)

  return (
    <Frame
      sub={showData
        ? `${rows.length} ${rows.length === 1 ? 'match scouted' : 'matches scouted'}${teams.length ? ` · ${teams.length} teams` : ''}`
        : `Screen ${step + 1} of ${SCOUTING_GROUPS.length} · ${group}`}
      action={
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowDrafts(true)}
            title="Matches put away on this phone, and ones waiting to send"
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${
              drafts.length ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-gray-200 bg-white text-gray-500 hover:bg-brand-blue/20'
            }`}
          >
            Drafts{drafts.length ? ` (${drafts.length})` : ''}
          </button>
          <HelpButton onClick={() => setShowHelp(true)} />
          <button
            onClick={() => setShowData(v => !v)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-brand-blue/20 transition-colors font-medium shrink-0"
          >
            {showData
              ? <><ArrowLeft size={14} /> Scout a match</>
              : <>{rows.length} saved <ArrowRight size={14} /></>}
          </button>
        </div>
      }
    >
      {showDrafts && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => setShowDrafts(false)}>
          <div className="bg-white w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="Drafts">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-800">Drafts on this phone</h2>
                <p className="text-[11px] text-gray-400">Unfinished matches wait for you. Finished ones that could not send go up on their own.</p>
              </div>
              <button type="button" onClick={() => setShowDrafts(false)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close">✕</button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {drafts.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No drafts. Use “Save as draft” under a form to put one away.</p>}
              {drafts.map(d => (
                <div key={d.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {d.kind === 'form' ? (d.label || 'Unfinished match') : `Team ${d.row.team_number} · match ${d.row.match_number}`}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {d.kind === 'form' ? 'Unfinished' : (d.tries ? `Waiting to send · ${d.tries} tr${d.tries === 1 ? 'y' : 'ies'}` : 'Waiting to send')} · {new Date(d.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  {d.kind === 'form' ? (
                    <button type="button" onClick={() => resumeDraft(d)} className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-gold hover:bg-brand-gold-dark text-gray-900 font-medium">Resume</button>
                  ) : (
                    <button type="button" onClick={sendDraftsNow} disabled={sendingDrafts} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-800 font-medium disabled:opacity-60">{sendingDrafts ? 'Sending…' : 'Send now'}</button>
                  )}
                  <button type="button" onClick={() => { if (confirm('Delete this draft?')) removeDraft(d.id) }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400" title="Delete draft"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showHelp && (
        <ScoutingHelp title="Match scouting" fields={SCOUTING_FIELDS} help={MATCH_HELP} notes={MATCH_SECTION_NOTES}
                      currentGroup={showData ? null : group} onClose={() => setShowHelp(false)} />
      )}
      {liveDay && !showData && (
        <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 bg-green-50 border border-green-200 text-green-800">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span className="font-semibold truncate">{liveDay.name || 'Competition Day'} is live</span>
          <span className="ml-auto shrink-0 text-green-700">
            {liveRota === null ? '' : liveRota.length === 0 ? 'Nothing on your rota' : liveLeft.length === 0 ? 'All of yours done' : `${liveLeft.length} of ${liveRota.length} of yours left`}
          </span>
        </div>
      )}
      {saved && (
        <div className="flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium">
          <Check size={15} /> Saved — team and match kept for the next one.
        </div>
      )}
      {schemaWarning && (
        <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900">
          <span className="flex-1">{schemaWarning}</span>
          <button type="button" onClick={() => setSchemaWarning('')} className="text-amber-700 underline shrink-0">dismiss</button>
        </div>
      )}

      {!showData ? (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-brand-gold-dark transition-all"
                   style={{ width: `${((step + 1) / SCOUTING_GROUPS.length) * 100}%` }} />
            </div>
          </div>

          <section className="bg-white/95 rounded-2xl shadow-sm border-2 border-brand-gold-dark/35 p-4">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-1.5"><span className="text-base">🍯</span>{group}</h2>
            <div className="space-y-4">
              {groupFields.map(f => (
                <Field key={f.key} field={f} value={form[f.key]} onChange={v => set(f.key, v)}
                       otherTeam={otherTeam} setOtherTeam={setOtherTeam}
                       schedule={schedule} currentMatch={form.match_number} />
              ))}
            </div>
          </section>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep(st => st - 1)}
                      className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {step < LAST ? (
              <button
                onClick={() => setStep(st => st + 1)}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-semibold bg-brand-gold-dark hover:brightness-95 text-gray-900 transition-all"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!ready || saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-gold-dark hover:brightness-95 disabled:bg-gray-100 disabled:text-gray-400 transition-all font-semibold text-gray-900"
              >
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save match'}
              </button>
            )}
          </div>

          <div className="flex justify-center -mt-1">
            <button type="button" onClick={saveAsDraft}
                    disabled={!form.team_number && !form.match_number}
                    title="Put this match away as it stands and come back to it from Drafts"
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-brand-blue/20 disabled:opacity-40">
              Save as draft
            </button>
          </div>

          {step === LAST && !ready && (
            <p className="text-xs text-gray-500 text-center -mt-1">
              Still needed before saving: {SCOUTING_FIELDS.filter(f => !filled(f)).map(f => f.label).join(' · ')}
            </p>
          )}

          {/* The sections, in any order. A scout fills them in as the match
              goes — auto, then teleop, then endgame — or jumps straight to the
              one they are ready for. Nothing is gated until Save, which wants
              every required answer; an unfinished section shows a dot. */}
          <div className="flex flex-wrap justify-center gap-1">
            {SCOUTING_GROUPS.map((g, i) => {
              const done = groupDone(g)
              return (
                <button key={g} onClick={() => setStep(i)}
                        className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                          i === step ? 'bg-brand-gold-dark border-brand-gold-dark text-gray-900 font-semibold'
                          : done ? 'border-transparent text-gray-500 hover:bg-brand-gold/40'
                          : 'border-brand-silver-dark/40 text-gray-600 hover:bg-brand-gold/40'
                        }`}>
                  {done ? '✓ ' : <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-silver-dark mr-1 align-middle" />}{g}
                </button>
              )
            })}
          </div>
        </>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500 font-medium">Nothing scouted yet.</p>
          <p className="text-sm text-gray-400 mt-1">Scout a match and it shows up here.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {[['matches', 'By match'], ['teams', 'By team']].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  view === v ? 'bg-brand-yellow text-gray-800' : 'bg-white text-gray-500 border border-gray-200 hover:bg-brand-blue/20'
                }`}>
                {label}
              </button>
            ))}
            {teams.length > 1 && (
              <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                      className="border rounded-lg px-2 py-1 text-xs">
                <option value="">All teams</option>
                {teams.map(t => <option key={t} value={t}>Team {t}</option>)}
              </select>
            )}
            <button onClick={exportCsv}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-brand-blue/20">
              <Download size={13} /> CSV
            </button>
            <ScoutingSync compact rows={shown} onReceived={() => setReload(n => n + 1)} />
            {hasLeadTag && (
              <button onClick={() => setEditing(v => !v)}
                      className={`p-1.5 rounded-lg transition-colors ${editing ? 'bg-brand-yellow text-gray-800' : 'text-gray-400 hover:bg-brand-blue/25'}`}
                      title={editing ? 'Done' : 'Remove rows'}>
                {editing ? <Check size={14} /> : <Pencil size={14} />}
              </button>
            )}
          </div>

          {view === 'matches'
            ? <MatchTable rows={shown} editing={editing} onRemove={remove} />
            : <TeamTable rows={byTeam.filter(t => !teamFilter || String(t.team) === teamFilter)} />}
        </>
      )}
    </Frame>
  )
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

// The comb. A tiled SVG rather than an image: it scales, costs nothing to
// load, and stays faint enough to read over.
const COMB = {
  backgroundColor: '#FFFDF6',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='98' viewBox='0 0 56 98'%3E%3Cg fill='none' stroke='%23F2C14E' stroke-opacity='0.22' stroke-width='1.4'%3E%3Cpath d='M28 1 L52 15 L52 43 L28 57 L4 43 L4 15 Z'/%3E%3Cpath d='M28 50 L52 64 L52 92 L28 106 L4 92 L4 64 Z'/%3E%3C/g%3E%3C/svg%3E")`,
}

function Frame({ sub, action, children }) {
  return (
    <div className="flex-1 flex flex-col min-w-0" style={COMB}>
      <header className="bg-white/85 backdrop-blur-sm shadow-sm sticky top-0 z-10 border-b-2 border-brand-gold-dark/35">
        <div className="px-4 py-3 ml-14 flex items-start justify-between gap-2 text-gray-200">
          <div>
            <h1 className="text-xl font-bold text-gray-100 flex items-center gap-1.5">
              <span>🐝</span> Scouting
            </h1>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          {action}
        </div>
      </header>
      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-3">{children}</div>
      </main>
    </div>
  )
}

function Field({ field: f, value, onChange, otherTeam, setOtherTeam, schedule = [], currentMatch = '' }) {
  const onSchedule = schedule.length > 0
  const thisMatch = onSchedule ? schedule.find(m => m.match === String(currentMatch || '').trim()) : null
  const [otherMatch, setOtherMatch] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {f.label} {f.required && <span className="text-brand-yellow-dark">*</span>}
      </label>
      {f.hint && <p className="text-[11px] text-gray-400 mb-1">{f.hint}</p>}

      {f.key === 'match_number' && onSchedule && !otherMatch ? (
        // The day's matches, as the schedule lists them. "Another match" is
        // for a match the schedule does not have yet.
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {schedule.map(m => (
              <button key={m.match} type="button"
                      onClick={() => onChange(String(value) === m.match ? '' : m.match)}
                      className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-colors ${
                        String(value) === m.match
                          ? 'border-brand-gold-dark bg-brand-gold text-gray-900 shadow-sm'
                          : 'border-brand-gold-dark/25 bg-white text-gray-500 hover:bg-brand-gold/35'
                      }`}>
                {m.match}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setOtherMatch(true)} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
            Another match, not on the schedule
          </button>
        </div>
      ) : f.key === 'match_number' && onSchedule && otherMatch ? (
        <div className="space-y-1.5">
          <input type="text" inputMode="numeric" value={value}
                 onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
                 placeholder="Match number" autoFocus
                 className="w-28 border-2 border-brand-gold-dark/30 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent" />
          <button type="button" onClick={() => { setOtherMatch(false); onChange('') }} className="block text-[11px] text-gray-400 hover:text-gray-600 underline">
            ← back to the schedule
          </button>
        </div>
      ) : f.key === 'team_number' ? (
        <div className="space-y-1.5">
          {onSchedule && !thisMatch && !otherMatch && (
            <p className="text-[11px] text-brand-silver-dark">Pick the match first, then the team is one of the four in it.</p>
          )}
          <TeamPicker value={value} onChange={onChange}
                      otherTeam={otherTeam} setOtherTeam={setOtherTeam}
                      only={thisMatch ? thisMatch.teams : null} matchLabel={thisMatch ? thisMatch.match : ''} />
          {thisMatch && value && !thisMatch.teams.includes(String(value).trim()) && (
            <p className="text-[11px] text-red-600">Team {value} is not in match {thisMatch.match} on the schedule. The board will not count this row against that match.</p>
          )}
        </div>
      ) : f.type === 'number' ? (
        <input type="number" inputMode="numeric" min="0" value={value}
               onChange={e => onChange(e.target.value)} placeholder="0"
               className="w-28 border-2 border-brand-gold-dark/30 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent" />
      ) : f.type === 'text' && ['comments', 'auto_notes', 'teleop_notes'].includes(f.key) ? (
        <textarea rows={2} value={value} onChange={e => onChange(e.target.value)}
                  placeholder="Anything unusual"
                  className="w-full border-2 border-brand-gold-dark/30 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent" />
      ) : f.type === 'text' ? (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
               placeholder={f.hint}
               className="w-full border-2 border-brand-gold-dark/30 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent" />
      ) : f.type === 'field' ? (
        // A map of the field with the driver station drawn on it, rather than
        // three words. Geometry in data/fieldMap.js, drawing in FieldMap.jsx.
        <FieldMap value={value} onChange={onChange} options={f.options} />
      ) : f.type === 'percent' ? (
        // A proportion, to the percent. This was six bars — 0, 20, 40, 60, 80,
        // 100 — and a scout who watched eight of nine autos work had to round
        // it to 80 or 100. The slider drags to any number, the five quick taps
        // underneath are there because most answers really are round, and the
        // box takes a typed number for anyone who counted exactly.
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="range" min="0" max="100" step="1"
              value={value === '' ? 0 : Number(value)}
              onChange={e => onChange(e.target.value)}
              className="flex-1 accent-brand-gold-dark"
              aria-label={`${f.label} percent`}
            />
            <div className="flex items-center gap-1 w-20 shrink-0">
              <input
                type="number" min="0" max="100" inputMode="numeric"
                value={value}
                onChange={e => {
                  const raw = e.target.value
                  if (raw === '') { onChange(''); return }
                  // Typed over the top of an existing number, a stray digit
                  // would otherwise save as 850% and poison the average.
                  onChange(String(Math.max(0, Math.min(100, Math.round(Number(raw))))))
                }}
                placeholder="—"
                className="w-12 border-2 border-brand-gold-dark/30 rounded-lg px-1.5 py-1 text-sm text-right focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent"
              />
              <span className="text-sm font-semibold text-gray-500">%</span>
            </div>
          </div>
          <div className="flex gap-1">
            {[0, 25, 50, 75, 100].map(p => (
              <button
                key={p} type="button"
                onClick={() => onChange(String(p))}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  Number(value) === p && value !== ''
                    ? 'border-brand-gold-dark bg-brand-gold text-gray-900'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-brand-gold/35'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      ) : f.type === 'multi' && f.map ? (
        // Tick-all, but the options are places on the field, so they are
        // tapped where they stand. Same stored value as the chips below.
        <FieldMap value={value} onChange={onChange} options={f.options} multi />
      ) : f.type === 'multi' ? (
        // Tick all that happened. More than one can be true in an endgame, and
        // forcing a single answer loses the rest.
        <div className="flex flex-wrap gap-1.5">
          {f.options.map(opt => {
            const picked = String(value || '').split(',').filter(Boolean)
            const on = picked.includes(opt)
            return (
              <button key={opt} type="button"
                onClick={() => onChange(toggleMulti(picked, opt, on))}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  on ? 'border-brand-gold-dark bg-brand-gold text-gray-900 shadow-sm'
                     : 'border-brand-gold-dark/25 bg-white text-gray-500 hover:bg-brand-gold/35'
                }`}>
                {on ? '✓ ' : ''}
                {f.key === 'rp_points'
                  ? <span className="inline-flex items-center gap-1.5 align-middle"><RpIcon option={opt} />{opt}</span>
                  : <>{f.icons?.[opt] ? <span className="mr-1" aria-hidden="true">{f.icons[opt]}</span> : null}{opt}</>}
              </button>
            )
          })}
        </div>
      ) : f.type === 'scale' ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: f.max - f.min + 1 }, (_, i) => f.min + i).map(n => (
            <button key={n} type="button"
                    onClick={() => onChange(value === String(n) ? '' : String(n))}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                      String(value) === String(n)
                        ? 'border-brand-gold-dark bg-brand-gold text-gray-900 shadow-sm'
                        : 'border-brand-gold-dark/25 bg-white text-gray-500 hover:bg-brand-gold/35'
                    }`}>
              {n}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {f.options.map(opt => (
            <button key={opt} type="button"
                    onClick={() => onChange(value === opt ? '' : opt)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      value === opt
                        ? 'border-brand-gold-dark bg-brand-gold text-gray-900 shadow-sm'
                        : 'border-brand-gold-dark/25 bg-white text-gray-500 hover:bg-brand-gold/35'
                    }`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Picking a team, with a search box — because thirty-three of them is past
// the point where scrolling a list is pleasant, and a scout at a competition
// knows the number before they know where it sits alphabetically.
//
// Matches on number OR name, so "cyber" and "4237" both find the Cyberhawks.
function TeamPicker({ value, onChange, otherTeam, setOtherTeam, only = null, matchLabel = '' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  // `only`: the teams in the chosen match. Offered first and alone, so the
  // right answer is one of four taps; a team not on our list still shows,
  // by number, because the schedule knows it even if teams.js does not.
  const pool = only
    ? only.map(n => ALL_TEAMS.find(t => String(t.number) === n) || { number: n, name: `Team ${n}` })
    : ALL_TEAMS
  const matches = pool.filter(t => {
    const s = q.trim().toLowerCase()
    return !s || String(t.number).includes(s) || String(t.name).toLowerCase().includes(s)
  })

  if (otherTeam) {
    return (
      <div className="space-y-1.5">
        <input
          type="text" inputMode="numeric" value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Their team number"
          className="w-full border-2 border-brand-gold-dark/40 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent"
          autoFocus
        />
        <button type="button"
                onClick={() => { setOtherTeam(false); onChange(''); setQ('') }}
                className="text-[11px] text-gray-400 hover:text-gray-600 underline">
          ← back to the list
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQ('') }}
        className={`w-full flex items-center justify-between gap-2 border-2 rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
          value ? 'border-brand-gold-dark bg-brand-gold/35 text-gray-900'
                : 'border-brand-gold-dark/40 bg-white text-gray-400'
        }`}
      >
        <span className="truncate">{value ? teamLabel(value) : (only ? `Pick a team in match ${matchLabel}…` : 'Pick a team…')}</span>
        <ChevronDown size={16} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <>
          {/* Tapping anywhere else closes it, which is what a dropdown does. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full bg-white border-2 border-brand-gold-dark/40 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search number or name…"
                autoFocus
                className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-3 text-center">
                  No team matches “{q}”. Use Other team below.
                </p>
              ) : matches.map(t => (
                <button
                  key={t.number} type="button"
                  onClick={() => { onChange(t.number); setOpen(false); setQ('') }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    value === t.number ? 'bg-brand-gold/50 text-gray-900 font-semibold'
                                       : 'hover:bg-brand-gold/30 text-gray-600'
                  }`}
                >
                  <span className="font-semibold text-gray-700">{t.number}</span>
                  <span className="text-gray-400"> — {t.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setOtherTeam(true); onChange(''); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm border-t border-gray-100 text-gray-500 hover:bg-brand-gold/30"
            >
              + Other team — not on the list
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const COMPACT = ['match_number', 'auto_shot', 'auto_made', 'teleop_shot', 'teleop_made', 'cycle_count',
                 'defense', 'endgame', 'driver_skill', 'consistency', 'breakdowns']

function MatchTable({ rows, editing, onRemove }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Team</th>
            {COMPACT.map(k => {
              const f = SCOUTING_FIELDS.find(x => x.key === k)
              return <th key={k} className="px-3 py-2 font-semibold whitespace-nowrap">{f.label}</th>
            })}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{r.team_number}</td>
              {COMPACT.map(k => (
                <td key={k} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {r[k] == null || r[k] === '' ? <span className="text-gray-300">—</span> : displayValue(FIELD_BY_KEY[k], r[k])}
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                {editing && (
                  <button onClick={() => onRemove(r.id)} title="Remove this row"
                          className="text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Comments don't fit a column, but they are the most useful thing a
          scout writes, so they sit under the table rather than being lost. */}
      {rows.some(r => r.comments) && (
        <div className="border-t border-gray-100 p-3 space-y-1.5">
          {rows.filter(r => r.comments).map(r => (
            <p key={r.id} className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{r.team_number}</span>
              <span className="text-gray-400"> · match {r.match_number} — </span>
              {r.comments}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamTable({ rows }) {
  const cols = NUMERIC_FIELDS
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Team</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Matches</th>
            {cols.map(f => <th key={f.key} className="px-3 py-2 font-semibold whitespace-nowrap">{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.team} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-2 font-medium text-gray-800">{t.team}</td>
              <td className="px-3 py-2 text-gray-400">{t.matches}</td>
              {cols.map(f => (
                <td key={f.key} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {t.avg[f.key] == null ? <span className="text-gray-300">—</span> : t.avg[f.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400 px-3 py-2 border-t border-gray-100">
        Averages across every match scouted. A blank is skipped, not counted as
        zero — a scout who didn't see something shouldn't drag a team down.
      </p>
    </div>
  )
}
