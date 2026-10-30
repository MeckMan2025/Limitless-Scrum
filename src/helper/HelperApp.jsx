import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Square, Loader2, Volume2, X, Check, RotateCcw, Bell, ChevronDown } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { authLinkError } from '../supabase'
import LoginScreen from '../components/LoginScreen'
import ForcePasswordChange from '../components/ForcePasswordChange'
import { entryQuestions, nextQuestion, questionsLeft } from '../data/notebookQuestions'
import { canRecord, startRecording, toWav, MAX_SECONDS } from './recorder'
import {
  voiceBackendReady, queueEntry, pendingEntries, sendEntry, nudgeUnfinished, latestVoiceEntry,
  analyzeEntry, loadEntry, patchEntry, finishEntry, unfinishedEntries, questionContext,
} from './voiceEntries'
import { pushSupported, registerHelperWorker, remindersOn, syncReminders, turnOnReminders } from './helperPush'
import { unlockVoice, stopVoice } from './questionVoice'
import QuestionStep from './Questions'

// EN Helper: the engineering notebook for students who won't type one.
//
// Talk about the meeting, then answer whatever that didn't cover, one question
// at a time, by voice or a tap. Every question gets an answer, the same as the
// typed form. The design notes and setup are in EN_HELPER.md.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

const PROMPT = "Tell your notebook about today. What did you work on? What went wrong, or what did you test? And what's next?"


// Local calendar date, not UTC: after about 7pm Central, UTC is already
// tomorrow and an evening entry would land on the wrong meeting.
function todayLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const dayLabel = (d) => d === todayLocal()
  ? 'Today'
  : new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const newId = () => String(Date.now()) + Math.random().toString(36).slice(2)

// Opened inside the Scrum app by a reminder (the app's own notification goes
// to /helper/?from=app). Remembered for the visit, so it survives a reload.
// Only ever true on the Helper's own page, never in the Scrum app's panel.
const openedFromApp = (() => {
  try {
    if (!window.location.pathname.startsWith(`${import.meta.env.BASE_URL}helper`)) return false
    if (new URLSearchParams(window.location.search).get('from') === 'app') sessionStorage.setItem('en-helper-from-app', '1')
    return sessionStorage.getItem('en-helper-from-app') === '1'
  } catch { return false }
})()

// The way back to Scrum shows on the Helper's own page whenever it isn't the
// installed EN Helper app: in a browser tab, or opened inside the Scrum app by
// a reminder. The installed app is its own app, so there you switch apps.
const showBackToScrum = () => {
  try { return window.location.pathname.startsWith(`${import.meta.env.BASE_URL}helper`) && (openedFromApp || !isStandalone()) } catch { return false }
}

// Back to the Scrum app, on the notebook.
function backToScrum() {
  try { localStorage.setItem('scrum-active-tab', 'notebook') } catch { /* lands on its usual tab */ }
  window.location.href = '/'
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-yellow/30 via-white to-brand-blue/30"
         style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">{children}</div>
    </div>
  )
}

function Notice({ title, children }) {
  return (
    <Screen>
      <Header />
      <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-2">
        <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
        <div className="text-sm text-gray-500">{children}</div>
      </div>
    </Screen>
  )
}

function Header({ name }) {
  return (
    <div className="flex items-center gap-3">
      {showBackToScrum() && (
        <button onClick={backToScrum} className="text-sm font-semibold text-gray-600 px-2 py-1.5 rounded-lg bg-white/80 shadow-sm shrink-0">
          ← Scrum
        </button>
      )}
      <img src={`${import.meta.env.BASE_URL}helper/icon-192.png`} alt="" className="w-10 h-10 rounded-xl shadow-sm" />
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-gray-800 leading-tight" style={{ fontFamily: "'Kalam', cursive" }}>EN Helper</h1>
        {name && <p className="text-xs text-gray-400 truncate">Signed in as {name}</p>}
      </div>
    </div>
  )
}

export default function HelperApp() {
  const { user, username, loading, passwordRecovery, mustChangePassword, updatePassword, sessionExpired, sessionLost, logout } = useUser()
  const { canSubmitNotebook } = usePermissions()

  if (loading) {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center gap-3 pt-32 text-gray-400">
          <Loader2 className="animate-spin" size={28} />
          <p className="text-sm">Opening your notebook…</p>
        </div>
      </Screen>
    )
  }
  // A home-screen app keeps its own sign-in on an iPhone, so the first open
  // asks once. The same screens as the main app, temporary passwords included.
  if (passwordRecovery) return <LoginScreen sessionExpired={sessionExpired} />
  if (!user) return <LoginScreen sessionExpired={sessionExpired} linkError={authLinkError} />
  if (mustChangePassword) return <ForcePasswordChange updatePassword={updatePassword} />
  if (!username) return <ProfileWait />
  if (sessionLost) {
    return (
      <Notice title="Please sign in again">
        Your sign-in expired, so the notebook can't save.{' '}
        <button onClick={() => logout()} className="mt-3 block mx-auto px-4 py-2 rounded-xl bg-brand-yellow font-semibold text-gray-800">Sign in again</button>
      </Notice>
    )
  }
  if (!canSubmitNotebook) {
    return <Notice title="Notebook entries are for team members">This account can read the notebook but can't write in it.</Notice>
  }
  return <Recorder />
}

// Signed in, profile not here yet. Supabase's client can sit on its own auth
// lock while it restores a session, which holds up the normal profile load;
// the main app rides that out on its 30 second profile check. A student
// holding a phone shouldn't wait that long, so after a moment ask for the
// profile the lock-free way (the same check, run now).
function ProfileWait() {
  const { user, refreshProfileNow } = useUser()
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (user?.id && !localStorage.getItem('scrum-cached-user-id')) localStorage.setItem('scrum-cached-user-id', user.id)
      } catch { /* storage blocked */ }
      refreshProfileNow?.()
    }, 1500)
    return () => clearTimeout(t)
  }, [user?.id]) // eslint-disable-line
  return <Notice title="Almost there">Loading your profile…</Notice>
}

// The recorder itself. The Helper page shows it full screen; the Scrum app's
// Notebook tab shows it as a panel (embedded), where the app already handles
// sign-in, notifications and the way back.
//
// One open recording first, then every question it didn't answer, one at a
// time. The recording saves the moment Next is tapped, as an unfinished entry,
// so nothing said is ever lost; the entry only counts (and only wins the
// meeting's attendance back) once the last question is answered.
export function Recorder({ embedded = false }) {
  const { user, username } = useUser()
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)

  const [ready, setReady] = useState(null) // null = checking
  // idle | recording | recorded | saving | analyzing | asking | finishing | saved
  const [stage, setStage] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [clip, setClip] = useState(null)
  const [error, setError] = useState('')
  const [claimed, setClaimed] = useState(false)
  const [waiting, setWaiting] = useState(0) // recordings still on this phone
  const [last, setLast] = useState(null)
  const [showLast, setShowLast] = useState(false)
  const [reminders, setReminders] = useState(true)
  const [days, setDays] = useState([todayLocal()])
  const [meetingDate, setMeetingDate] = useState(todayLocal())
  const [pickingDay, setPickingDay] = useState(false)
  const [installHint, setInstallHint] = useState(false)

  // The questions.
  const [entry, setEntry] = useState(null)
  const [ctx, setCtx] = useState({ projects: [], mentors: [] })
  const [unfinished, setUnfinished] = useState([])
  const [history, setHistory] = useState([]) // questions answered this visit, for Back
  const [revisit, setRevisit] = useState(null) // a question being answered again
  const [heard, setHeard] = useState(null) // { text, qid }: the last spoken answer

  const recRef = useRef(null)
  const timerRef = useRef(null)

  // ── On open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!embedded) registerHelperWorker()
    voiceBackendReady().then(setReady)
    try {
      setInstallHint(isIos() && !isStandalone() && !embedded && !openedFromApp && localStorage.getItem('en-helper-install-hint') !== 'hidden')
    } catch { /* storage blocked */ }
  }, [])

  useEffect(() => {
    if (!user?.id || embedded) return
    syncReminders(user.id)
    remindersOn().then(setReminders)
  }, [user?.id])

  const refreshLists = useCallback(() => {
    unfinishedEntries(username, SCOPE).then(setUnfinished)
    latestVoiceEntry(username, SCOPE).then(setLast)
  }, [username, SCOPE])

  // Send anything left on the phone from last time. Each one becomes an
  // unfinished entry, waiting for its questions.
  const flushWaiting = useCallback(async () => {
    const queued = await pendingEntries(username)
    let left = queued.length
    setWaiting(left)
    for (const item of queued) {
      try { await sendEntry(item); left -= 1 } catch (err) { console.warn('[EN Helper] still waiting:', err.message) }
    }
    setWaiting(left)
    return left
  }, [username])

  useEffect(() => {
    if (!ready || !username) return
    questionContext(SCOPE).then(setCtx)
    flushWaiting().finally(() => {
      nudgeUnfinished(username, SCOPE)
      refreshLists()
    })
  }, [ready, username]) // eslint-disable-line

  // Which meeting this is for. Today, unless today is already written up and
  // an earlier meeting isn't: then that one, since it's what the attendance
  // rule is counting against. The same rules as the typed form.
  useEffect(() => {
    if (!username) return
    let live = true
    const h = restHeaders()
    const name = encodeURIComponent(username)
    Promise.all([
      fetch(`${supabaseUrl}/rest/v1/attendance_sessions?${SCOPE}&select=id,session_date&order=session_date.desc&limit=60`, { headers: h }).then(r => (r.ok ? r.json() : [])),
      fetch(`${supabaseUrl}/rest/v1/attendance_records?${SCOPE}&username=eq.${name}&select=session_id,status,marked_by`, { headers: h }).then(r => (r.ok ? r.json() : [])),
      fetch(`${supabaseUrl}/rest/v1/notebook_entries?${SCOPE}&username=eq.${name}&complete=eq.true&select=meeting_date`, { headers: h }).then(r => (r.ok ? r.json() : [])),
    ]).then(([sessions, records, written]) => {
      if (!live) return
      const today = todayLocal()
      const mine = Object.fromEntries((records || []).map(r => [r.session_id, r]))
      const wrote = new Set((written || []).map(e => e.meeting_date))
      const blocked = new Set()
      const missing = []
      for (const s of sessions || []) {
        const r = mine[s.id]
        if (!r) continue // not on that meeting's roster
        // A lead marked them absent, or they were excused: nothing to write up.
        if (r.status === 'excused' || (r.status === 'absent' && r.marked_by !== 'notebook-rule')) { blocked.add(s.session_date); continue }
        if (s.session_date <= today && !wrote.has(s.session_date)) missing.push(s.session_date)
      }
      const options = [...new Set([...(blocked.has(today) ? [] : [today]), ...missing])].slice(0, 6)
      setDays(options.length ? options : [today])
      setMeetingDate(missing.includes(today) || !missing.length ? (options[0] || today) : missing[0])
    }).catch(() => {})
    return () => { live = false }
  }, [username]) // eslint-disable-line

  // ── The first recording ───────────────────────────────────────────────
  const stopTimer = () => { clearInterval(timerRef.current); timerRef.current = null }

  const stop = async () => {
    stopTimer()
    const rec = recRef.current
    recRef.current = null
    if (!rec) return
    const raw = await rec.stop()
    if (raw.size < 2000) {
      setStage('idle')
      setError("That was too short to hear. Tap the mic and try again.")
      return
    }
    setClip(raw)
    setStage('recorded')
  }

  const start = async () => {
    setError('')
    if (speaking) { audioRef.current?.pause(); setSpeaking(false) }
    try {
      recRef.current = await startRecording()
    } catch (err) {
      setError(err?.name === 'NotAllowedError'
        ? "EN Helper needs your microphone. Tap the mic again and choose Allow. If it doesn't ask, turn the microphone on for this site in your phone's settings."
        : "Your phone wouldn't start recording. Close EN Helper and open it again.")
      return
    }
    setSeconds(0)
    setStage('recording')
    const began = Date.now()
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000)
      setSeconds(s)
      if (s >= MAX_SECONDS) stop()
    }, 250)
  }

  useEffect(() => () => { stopTimer(); recRef.current?.cancel(); stopVoice() }, [])

  const redo = () => { setClip(null); setStage('idle'); setSeconds(0) }

  // The prompt never changes, so it's a recorded clip (public/helper/prompt.mp3,
  // made once with Cloudflare's text-to-speech) rather than the browser's own
  // voice. On an iPhone that voice is unreliable in home-screen apps and goes
  // quiet with the silent switch on; an ordinary audio clip plays either way.
  // Tap again to stop. The browser's voice is only the fallback.
  const audioRef = useRef(null)
  const [speaking, setSpeaking] = useState(false)
  const speak = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(`${import.meta.env.BASE_URL}helper/prompt.mp3`)
      audioRef.current.onended = () => setSpeaking(false)
    }
    const a = audioRef.current
    if (speaking) { a.pause(); a.currentTime = 0; setSpeaking(false); return }
    a.currentTime = 0
    setSpeaking(true)
    a.play().catch(() => {
      setSpeaking(false)
      try {
        const u = new SpeechSynthesisUtterance(PROMPT)
        u.rate = 0.95
        window.speechSynthesis.speak(u)
      } catch { /* no voice on this device */ }
    })
  }

  // ── Into the questions ────────────────────────────────────────────────
  const beginQuestions = (row) => {
    setEntry(row)
    setHistory([])
    setRevisit(null)
    setHeard(null)
    setError('')
    setStage('asking')
  }

  const next = async () => {
    if (!clip || stage === 'saving') return
    unlockVoice() // this tap is what lets the questions be read out later
    setStage('saving')
    setError('')
    const audio = (await toWav(clip)) || clip
    const item = {
      id: newId(),
      username,
      team_number: myTeamNumber || '',
      meeting_date: meetingDate,
      created_at: new Date().toISOString(),
      audio: await audio.arrayBuffer(),
      audioType: audio.type,
    }
    // On the phone first, so nothing after this line can lose it.
    await queueEntry(item).catch(err => console.warn('[EN Helper] could not keep a copy on the phone:', err))
    try {
      await sendEntry(item)
    } catch (err) {
      console.warn('[EN Helper] save failed, kept on the phone:', err)
      setStage('recorded')
      setError("Couldn't reach the notebook. Your recording is safe on this phone. Tap Next again when you have signal.")
      setWaiting((await pendingEntries(username)).length)
      return
    }
    setWaiting((await pendingEntries(username)).length)
    setStage('analyzing')
    const row = (await analyzeEntry(item.id)) || (await loadEntry(item.id).catch(() => null))
    if (!row) {
      setStage('idle')
      setClip(null)
      setError("Your recording is saved. Couldn't load the questions just now; tap Continue above when you have signal.")
      refreshLists()
      return
    }
    beginQuestions(row)
  }

  const resume = async (row) => {
    unlockVoice()
    setError('')
    const fresh = await loadEntry(row.id).catch(() => null)
    // Saved before its recording was read (offline, say): read it now.
    const current = fresh || row
    if (current.audio_path && !current.transcript) {
      setStage('analyzing')
      beginQuestions((await analyzeEntry(current.id)) || current)
    } else {
      beginQuestions(current)
    }
  }

  const all = entry ? entryQuestions(entry, ctx) : []
  const left = all.filter(q => !q.answered(entry)).length
  const current = !entry ? null
    : (revisit && all.find(q => q.id === revisit)) || nextQuestion(entry, ctx)

  const answer = async (value) => {
    const q = current
    const patch = q.patch(entry, value)
    const saved = await patchEntry(entry.id, patch)
    setEntry(saved || { ...entry, ...patch })
    setHistory(h => [...h.filter(id => id !== q.id), q.id])
    setRevisit(null)
    setHeard(q.kind === 'text' ? { text: value, qid: q.id } : null)
  }

  const backTo = (() => {
    const at = revisit ? history.indexOf(revisit) : history.length
    return at > 0 ? history[at - 1] : null
  })()

  const finish = async () => {
    setStage('finishing')
    setError('')
    try {
      const { claimed: won } = await finishEntry(entry, SCOPE)
      setClaimed(won)
      setStage('saved')
      refreshLists()
    } catch {
      setStage('asking')
      setError("Couldn't finish saving. Check your signal and try again.")
    }
  }

  // The last answer in: finish.
  useEffect(() => {
    if (stage === 'asking' && entry && !current && !error) finish()
  }, [stage, entry, current?.id]) // eslint-disable-line

  const another = () => {
    setClip(null); setEntry(null); setClaimed(false); setSeconds(0); setError(''); setStage('idle')
  }

  const later = () => {
    stopVoice()
    setEntry(null); setClip(null); setError(''); setStage('idle')
    refreshLists()
  }

  // ── Screens ───────────────────────────────────────────────────────────
  if (ready === false) {
    return (
      <Notice title="EN Helper isn't switched on yet">
        Your coach needs to finish setting it up. Until then, write today's entry in the Notebook tab of the Scrum app.
      </Notice>
    )
  }

  if (stage === 'analyzing') {
    return (
      <Screen>
        <Header name={username} />
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
          <Loader2 className="animate-spin mx-auto text-brand-yellow-dark" size={34} />
          <p className="text-gray-700 font-medium">Listening to what you said…</p>
          <p className="text-xs text-gray-400">Then just the questions it didn't answer.</p>
        </div>
      </Screen>
    )
  }

  if ((stage === 'asking' || stage === 'finishing') && entry) {
    return (
      <Screen>
        <Header name={username} />
        <p className="text-xs text-gray-500 -mb-1">Entry for {dayLabel(entry.meeting_date)}</p>
        {current ? (
          <QuestionStep
            key={current.id}
            entry={entry}
            question={current}
            done={all.length - left}
            left={left}
            heard={revisit ? null : heard?.text}
            onRedoHeard={heard ? () => { setRevisit(heard.qid); setHeard(null) } : null}
            onAnswer={answer}
            onBack={backTo ? () => { setHeard(null); setRevisit(backTo) } : null}
          />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center space-y-3">
            <Loader2 className="animate-spin mx-auto text-brand-yellow-dark" size={30} />
            <p className="text-gray-700 font-medium">Saving your entry…</p>
            {error && (
              <>
                <p className="text-sm text-red-500">{error}</p>
                <button onClick={finish} className="px-4 py-2 rounded-xl bg-brand-yellow font-semibold text-gray-800">Try again</button>
              </>
            )}
          </div>
        )}
        <button onClick={later} className="w-full text-center text-xs text-gray-400 underline">
          Finish later (it's saved, but it won't count until it's done)
        </button>
      </Screen>
    )
  }

  if (stage === 'saved') {
    return (
      <Screen>
        <Header name={username} />
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <Check className="text-green-600" size={34} />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Done. It's in your notebook.</h2>
          <p className="text-sm text-gray-500">
            {claimed ? "You're marked present for that meeting again. " : ''}
            Every question is answered. The written-up version will be next to your words in a minute or two.
          </p>
          {!reminders && !embedded && !openedFromApp && pushSupported() && (
            <button
              onClick={async () => {
                const on = await turnOnReminders(user.id).catch(() => false)
                setReminders(on)
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-blue/40 hover:bg-brand-blue/60 font-semibold text-gray-700"
            >
              <Bell size={18} /> Remind me after meetings
            </button>
          )}
          <button onClick={another} className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-medium">
            Record another
          </button>
        </div>
      </Screen>
    )
  }

  const recording = stage === 'recording'
  const recorded = stage === 'recorded' || stage === 'saving'
  const saving = stage === 'saving'

  return (
    <Screen>
      <Header name={username} />

      {installHint && (
        <div className="bg-white/90 rounded-xl shadow-sm p-3 text-xs text-gray-600 flex items-start gap-2">
          <span className="flex-1">
            <b>Put EN Helper on your Home Screen:</b> tap the Share button, then <b>Add to Home Screen</b>.
          </span>
          <button
            aria-label="Hide"
            onClick={() => { setInstallHint(false); try { localStorage.setItem('en-helper-install-hint', 'hidden') } catch { /* fine */ } }}
            className="text-gray-400"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {waiting > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-center gap-2">
          <span className="flex-1">{waiting === 1 ? 'A recording is' : `${waiting} recordings are`} waiting on this phone to be saved.</span>
          <button onClick={() => flushWaiting().then(refreshLists)} className="px-3 py-1 rounded-lg bg-amber-200/70 font-semibold">Send</button>
        </div>
      )}

      {/* An entry with questions left comes first: it doesn't count yet. */}
      {!recording && !recorded && unfinished.map(u => (
        <div key={u.id} className="bg-brand-yellow/20 border border-brand-yellow rounded-xl p-3 flex items-center gap-3">
          <span className="flex-1 text-sm text-gray-700">
            <b>Finish your entry</b> for {dayLabel(u.meeting_date)}
            <span className="block text-xs text-gray-500">{questionsLeft(u, ctx)} questions left. It counts once they're done.</span>
          </span>
          <button onClick={() => resume(u)} className="px-4 py-2 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark font-semibold text-gray-800 text-sm">
            Continue
          </button>
        </div>
      ))}

      {/* The prompt, and the day it's for. */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setPickingDay(p => !p)}
            disabled={recording || saving || days.length < 2}
            className="flex items-center gap-1 text-sm font-semibold text-gray-600 disabled:opacity-100"
          >
            {dayLabel(meetingDate)}
            {days.length > 1 && <ChevronDown size={16} className="text-gray-400" />}
          </button>
          <button onClick={speak} aria-label={speaking ? 'Stop reading' : 'Read the question out loud'}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg ${speaking ? 'bg-brand-yellow/50 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
            <Volume2 size={16} /> {speaking ? 'Stop' : 'Hear it'}
          </button>
        </div>
        {pickingDay && (
          <div className="flex flex-wrap gap-2">
            {days.map(d => (
              <button key={d} onClick={() => { setMeetingDate(d); setPickingDay(false) }}
                className={`px-3 py-1.5 rounded-lg text-sm ${d === meetingDate ? 'bg-brand-yellow font-semibold' : 'bg-gray-100 text-gray-600'}`}>
                {dayLabel(d)}
              </button>
            ))}
          </div>
        )}
        <p className="text-lg text-gray-800 leading-snug" style={{ fontFamily: "'Kalam', cursive" }}>
          Tell your notebook about today.
        </p>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>• What did you work on?</li>
          <li>• What went wrong, or what did you test?</li>
          <li>• What's next?</li>
        </ul>
      </div>

      <div className="flex flex-col items-center gap-2 py-2">
        {!canRecord() ? (
          <p className="text-sm text-gray-500 text-center">
            This browser can't record audio. Open EN Helper in Safari on an iPhone, or Chrome on Android.
          </p>
        ) : recorded ? (
          <div className="flex items-center gap-3 bg-white rounded-full shadow-sm pl-4 pr-2 py-2">
            <Check className="text-green-600" size={20} />
            <span className="text-sm text-gray-700 font-medium">Recorded {clock(seconds)}</span>
            <button onClick={redo} disabled={saving}
              className="flex items-center gap-1 text-xs text-gray-500 px-3 py-1.5 rounded-full bg-gray-100">
              <RotateCcw size={14} /> Redo
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={recording ? stop : start}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
              className={`w-32 h-32 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 ${
                recording ? 'bg-red-500 animate-pulse' : 'bg-gray-800'
              }`}
            >
              {recording ? <Square className="text-white" size={44} fill="white" /> : <Mic className="text-white" size={56} />}
            </button>
            <p className="text-sm text-gray-500">
              {recording ? `${clock(seconds)}  ·  tap to stop` : 'Tap to talk'}
            </p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      {recorded && (
        <button
          onClick={next}
          disabled={saving}
          className="w-full py-4 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-40 text-lg font-bold text-gray-800 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="animate-spin" size={20} /> Saving…</> : 'Next'}
        </button>
      )}

      {/* How the last one is doing, so nobody wonders whether it worked. */}
      {last && !recording && !recorded && (
        <div className="bg-white/80 rounded-xl p-3 text-sm text-gray-600">
          <button onClick={() => setShowLast(s => !s)} className="w-full text-left flex items-center gap-2">
            <span className="flex-1">
              Last entry ({dayLabel(last.meeting_date)}):{' '}
              {last.ai_status === 'done' ? <span className="text-green-700">in your notebook</span>
                : last.ai_status === 'empty' ? <span className="text-amber-700">no speech was heard</span>
                  : <span className="text-gray-500">being written up…</span>}
            </span>
            {last.ai_status === 'done' && <ChevronDown size={16} className={`text-gray-400 transition-transform ${showLast ? 'rotate-180' : ''}`} />}
          </button>
          {showLast && last.ai_status === 'done' && (
            <p className="mt-2 text-gray-700 whitespace-pre-line">{last.polished}</p>
          )}
        </div>
      )}
    </Screen>
  )
}
