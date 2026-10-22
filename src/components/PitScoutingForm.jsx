import { useState, useEffect, useMemo } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { Check, Loader2, ArrowRight, ArrowLeft, ClipboardList, Camera, X } from 'lucide-react'
import { uploadNotebookPhoto } from '../lib/notebookPhoto'
import { PIT_FIELDS, PIT_GROUPS, blankPitEntry, OTHER, isOther, otherDetail, choiceOf } from '../data/pitFields'
import { takeScoutRequest, announceScoutSaved } from '../lib/scoutHandoff'
import ScoutingHelp, { HelpButton } from './ScoutingHelp'
import { useAnnounceScouting } from '../hooks/useScoutingPresence'
import { PIT_HELP, PIT_SECTION_NOTES } from '../data/scoutingHelp'
import { ALL_TEAMS } from '../data/teams'
import { teamScope } from '../lib/teamScope'
import { HOME_TEAM_NUMBER } from '../data/team'

// Pit scouting: one row per team you visit.
//
// Same machinery as match scouting — the field definitions drive the pages,
// the inputs and the saved row — and deliberately the same look, because a
// scout should not have to learn two forms on the one day they have no time to.
//
// What is different is the attitude to blanks. Match scouting refuses a
// half-filled row, because an average built from partial rows is a lie. A pit
// sheet is a conversation with whoever is standing there: the robot may be in
// pieces, the driver may be in a match, and "I did not get to ask" is a real
// answer. Only the team and the scout's name are required.

const TABLE = 'pit_scouting'

// Now, in the form a date-time picker reads: local time, YYYY-MM-DDTHH:mm.
// A pretty "Oct 16, 7:02 PM" string shows as an empty picker.
const nowForPicker = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// onDone, when given, is called after a successful save: on a live day the
// board is where you go next.
export default function PitScoutingForm({ onDone, liveDay = null }) {
  const { username } = useUser()
  const { myTeamNumber } = usePermissions()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const headers = restHeaders()

  const [form, setForm] = useState(() => {
    // Opened from the board with a team on it: start on that team.
    const handed = takeScoutRequest()
    const team = handed?.team ? String(handed.team) : ''
    const known = team ? ALL_TEAMS.find(t => String(t.number) === team) : null
    return {
      ...blankPitEntry(),
      scout_name: username || '',
      visited_at: nowForPicker(),
      ...(team ? { team_number: team, team_name: known ? known.name : '' } : {}),
    }
  })
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [unavailable, setUnavailable] = useState(false)

  const SCOPE = teamScope(myTeamNumber)

  // What has already been scouted, so the form can say so rather than letting
  // two people write the same team up twice without noticing.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/${TABLE}?${SCOPE}&select=id,team_number,scout_name,created_at&order=created_at.desc`,
          { headers },
        )
        if (!res.ok) { if (!cancelled) setUnavailable(true); return }
        const data = await res.json()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch { if (!cancelled) setUnavailable(true) }
    })()
    return () => { cancelled = true }
  }, [myTeamNumber]) // eslint-disable-line

  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError('') }

  const pages = PIT_GROUPS
  const fieldsOn = (group) => PIT_FIELDS.filter(f => f.group === group)
  const onLast = step === pages.length - 1

  // Only what we will not guess at. Everything else can be blank.
  // Required and blank, or "Other" with nothing said about it.
  const missing = PIT_FIELDS.filter(f =>
    (f.required && !String(form[f.key] || '').trim()) ||
    (f.type === 'choice' && isOther(form[f.key]) && !otherDetail(form[f.key]).trim()))
  // The robot photo, on its way up. The same upload the Engineering Notebook
  // uses, so a picture goes up the same way from both and lands in the same
  // place. Taken with the camera on a phone, picked from files on a laptop.
  const [showHelp, setShowHelp] = useState(false)
  useAnnounceScouting(liveDay?.id, form.team_number ? { kind: 'pit', team: form.team_number } : null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const pickPhoto = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // picking the same file again after a failure still fires
    if (!file) return
    setPhotoBusy(true); setPhotoError('')
    uploadNotebookPhoto(file)
      .then(url => { set('photo_url', url); setPhotoBusy(false) })
      .catch(err => { setPhotoBusy(false); setPhotoError(err.message) })
  }
  const ready = missing.length === 0

  const already = useMemo(() => {
    const t = String(form.team_number || '').trim()
    if (!t) return null
    return rows.find(r => String(r.team_number).trim() === t) || null
  }, [form.team_number, rows])

  const submit = async () => {
    if (!ready || saving) return
    setSaving(true); setError('')
    try {
      const row = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, scout: username }
      PIT_FIELDS.forEach(f => {
        const raw = form[f.key]
        row[f.key] = raw === '' || raw == null ? null : String(raw).trim()
      })
      // Whose row this is. team_number is the team being scouted, so the owner
      // lives in its own column.
      const mine = String(myTeamNumber || '').trim()
      if (mine && mine !== HOME_TEAM_NUMBER) row.team_number_owner = mine

      const res = await fetch(`${supabaseUrl}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(await res.text())
      setRows(prev => [{ ...row, created_at: new Date().toISOString() }, ...prev])
      setStep(0)
      // A fresh sheet for the next pit, keeping who you are and roughly when.
      setForm({
        ...blankPitEntry(),
        scout_name: form.scout_name,
        visited_at: nowForPicker(),
      })
      announceScoutSaved()
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      onDone?.()
    } catch (err) {
      console.error('Failed to save pit row:', err)
      setError("Couldn't save — your answers are still here. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full border-2 border-brand-gold-dark/30 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-gold-dark focus:border-transparent'
  const chip = (on) => `px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
    on ? 'border-brand-gold-dark bg-brand-gold text-gray-900 shadow-sm'
       : 'border-brand-gold-dark/25 bg-white text-gray-500 hover:bg-brand-gold/35'}`

  // A plain function, not a component. Defined inside the form it would be a
  // new component type on every render, and React would throw away the input
  // and make a fresh one on each keystroke — which on a phone means one
  // character, then the keyboard closes. Called as a function it is just
  // markup, and the input stays put.
  const renderField = (f) => (
    <div className="mb-4" key={f.key}>
      <label className="block text-sm font-semibold text-gray-700 mb-0.5">
        {f.label}{f.required && <span className="text-brand-silver-dark"> *</span>}
      </label>
      {f.hint && <p className="text-[11px] text-gray-400 mb-1">{f.hint}</p>}

      {f.key === 'team_number' ? (
        <>
          <input type="text" inputMode="numeric" value={form.team_number}
                 onChange={e => {
                   const v = e.target.value
                   const known = ALL_TEAMS.find(t => String(t.number) === v.trim())
                   setForm(f2 => ({ ...f2, team_number: v, team_name: known ? known.name : f2.team_name }))
                 }}
                 placeholder="Team number" className={input} />
          {already && (
            <p className="text-[11px] text-brand-silver-dark mt-1">
              Already scouted by {already.scout_name || 'someone'}. Saving adds a second visit.
            </p>
          )}
        </>
      ) : f.type === 'choice' ? (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {f.options.map(opt => (
              <button key={opt} type="button"
                      title={f.describe?.[opt] || ''}
                      onClick={() => set(f.key, choiceOf(form[f.key]) === opt ? '' : opt)}
                      className={chip(choiceOf(form[f.key]) === opt)}>
                {opt}
              </button>
            ))}
          </div>
          {f.describe && choiceOf(form[f.key]) && choiceOf(form[f.key]) !== OTHER && (
            <p className="text-[11px] text-gray-400 mt-1">{f.describe[choiceOf(form[f.key])]}</p>
          )}
          {isOther(form[f.key]) && (
            <div className="mt-2">
              <input type="text" value={otherDetail(form[f.key])}
                     onChange={e => set(f.key, e.target.value ? `${OTHER}: ${e.target.value}` : OTHER)}
                     placeholder="What is it? (required)" autoFocus className={input} />
              {!otherDetail(form[f.key]).trim() && <p className="text-[11px] text-brand-silver-dark mt-1">Say what the other is before saving.</p>}
            </div>
          )}
        </div>
      ) : f.type === 'datetime' ? (
        // The phone's own picker: a scroll wheel on iPhone, a dialog elsewhere.
        <input type="datetime-local" value={form[f.key]} onChange={e => set(f.key, e.target.value)}
               className={input} />
      ) : f.type === 'photo' ? (
        <div>
          {form[f.key] ? (
            <div className="relative inline-block">
              <img src={form[f.key]} alt="Robot" className="max-h-48 rounded-xl object-cover border border-gray-100" />
              <button type="button" onClick={() => set(f.key, '')} title="Retake"
                      className="absolute -top-2 -right-2 bg-white rounded-full shadow p-0.5 text-gray-400 hover:text-red-400">
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-brand-gold-dark/40 hover:border-brand-gold-dark cursor-pointer transition-colors bg-white">
              <Camera size={18} className="text-brand-gold-dark" />
              <span className="text-sm text-gray-600">{photoBusy ? 'Uploading…' : 'Take a photo of the robot'}</span>
              {photoBusy && <Loader2 size={16} className="ml-auto animate-spin text-brand-gold-dark" />}
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={photoBusy} onChange={pickPhoto} />
            </label>
          )}
          {photoError && <p className="text-xs text-red-500 mt-1.5">{photoError}</p>}
        </div>
      ) : ['strengths', 'weaknesses', 'final_notes', 'alliance_why', 'known_problems', 'auto_what'].includes(f.key) ? (
        <textarea rows={2} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                  placeholder="Short answer" className={input} />
      ) : (
        <input type="text" value={form[f.key]} onChange={e => set(f.key, e.target.value)}
               placeholder={f.hint || 'Short answer'} className={input} />
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between gap-2 text-gray-200">
          <div className="min-w-0 text-gray-200">
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-gold-dark via-brand-silver-dark to-brand-silver-dark bg-clip-text text-transparent">
              Pit Scouting
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {pages[step]} · {step + 1} of {pages.length}
              {rows.length > 0 && ` · ${rows.length} pit${rows.length === 1 ? '' : 's'} done`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-gray-200">
            <HelpButton onClick={() => setShowHelp(true)} />
            <ClipboardList size={18} className="text-brand-gold-dark shrink-0" />
          </div>
        </div>
        <div className="h-1 bg-gray-800">
          <div className="h-1 bg-brand-gold-dark transition-all"
               style={{ width: `${((step + 1) / pages.length) * 100}%` }} />
        </div>
      </header>

      {showHelp && (
        <ScoutingHelp title="Pit scouting" fields={PIT_FIELDS} help={PIT_HELP} notes={PIT_SECTION_NOTES}
                      currentGroup={pages[step]} onClose={() => setShowHelp(false)} />
      )}

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-xl mx-auto">
          {saved && (
            <div className="flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium mb-3">
              <Check size={15} /> Saved.
            </div>
          )}
          {unavailable && (
            <p className="text-sm text-brand-silver-dark mb-3">
              The pit scouting table isn't set up yet — run supabase/pit_scouting.sql.
            </p>
          )}

          <h2 className="text-base font-bold text-gray-800 mb-3">{pages[step]}</h2>
          {fieldsOn(pages[step]).map(renderField)}

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="flex items-center justify-between gap-2 mt-5">
            <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))}
                    disabled={step === 0}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 disabled:opacity-40">
              <ArrowLeft size={15} /> Back
            </button>

            {onLast ? (
              <button type="button" onClick={submit} disabled={!ready || saving}
                      title={ready ? '' : `Still needed: ${missing.map(f => f.label).join(', ')}`}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        ready && !saving
                          ? 'bg-brand-gold hover:bg-brand-gold-dark text-gray-800'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save pit</>}
              </button>
            ) : (
              <button type="button" onClick={() => setStep(s => Math.min(pages.length - 1, s + 1))}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold-dark text-gray-800 text-sm font-semibold transition-colors">
                Next <ArrowRight size={15} />
              </button>
            )}
          </div>

          {!ready && onLast && (
            <p className="text-[11px] text-gray-400 mt-2 text-right">
              Still needed: {missing.map(f => f.label).join(', ')}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
