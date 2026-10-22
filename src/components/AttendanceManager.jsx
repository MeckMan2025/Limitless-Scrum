import { useState, useEffect, useRef } from 'react'
import { lazyHeadersWith, lazyRestHeaders, ensureUserToken } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { rowBelongs, stampTeam, teamScope } from '../lib/teamScope'
import { ensureSessionForDate, genId, todayStr } from '../lib/attendanceSession'
import { ArrowLeft, ClipboardCheck, Trash2, Edit3, Plus, X, UserPlus, ChevronDown, ChevronUp, Clock, ScanLine, Contact } from 'lucide-react'
import {
  presencePct, sessionDuration, recordTiming, timingTouched, filedTiming, timingColumns,
  loadStandingNotices, saveRecordTiming, applyTimingPatch, saveSessionDuration,
  weekdayOf, WEEKDAY_NAMES,
} from '../lib/attendanceTiming'
import { excludedFromAttendance } from '../lib/attendanceRoster'
import BadgeScanInput from './BadgeScanInput'
import BadgeKiosk from './BadgeKiosk'
import BadgeAssign from './BadgeAssign'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const REST_HEADERS = lazyRestHeaders
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })

const STATUS_COLORS = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-orange-100 text-orange-700',
  'no record': 'bg-gray-100 text-gray-400',
}

export default function AttendanceManager({ onBack }) {
  const { username } = useUser()
  const { hasLeadTag, myTeamNumber } = usePermissions()
  // One rule for whose rows these are — see lib/teamScope.js.
  const SCOPE = teamScope(myTeamNumber)

  const [sessions, setSessions] = useState([])
  const [records, setRecords] = useState([])
  const [profiles, setProfiles] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [editing, setEditing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [addingUser, setAddingUser] = useState(false)
  // Standing notices for the whole team ("every Thursday I leave at 6:30").
  // One small read; each session picks out its own weekday.
  const [standing, setStanding] = useState([])
  const [expandedRec, setExpandedRec] = useState(null)
  // The list, the badge kiosk at the door, or linking badges to people.
  const [mode, setMode] = useState('list')
  // Guards "Start Today's Session" against repeat taps. The ref is what the
  // handler reads (state updates are async and a fast second tap would miss it).
  const creatingRef = useRef(false)
  const [creating, setCreating] = useState(false)
  // Who wrote a notebook entry, by meeting date. Attendance follows the
  // notebook: no entry means absent, an entry means present. Being late or
  // leaving early never decides it on its own.
  const [notebookByDate, setNotebookByDate] = useState({})
  const [applyingRule, setApplyingRule] = useState(false)
  // Absence notices filed for the open session's date. noticesFor says which
  // date they were loaded for, so nothing acts on an empty list that simply
  // hasn't arrived yet.
  const [notices, setNotices] = useState([])
  const [noticesFor, setNoticesFor] = useState(null)

  // Mentors, coaches, team accounts and the ETS account are never part of
  // attendance — see lib/attendanceRoster.
  const excludeFromAttendance = excludedFromAttendance
  // Fetch all sessions, records, and profiles
  // Fetch sessions, records, profiles on mount
  useEffect(() => {
    const headers = REST_HEADERS
    // A real token first: sent with the anon key, every one of these comes
    // back empty and the manager looks like no meeting was ever logged.
    ensureUserToken().then(() => Promise.all([
      fetch(`${REST_URL}/rest/v1/attendance_sessions?${SCOPE}&select=*&order=session_date.desc`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${REST_URL}/rest/v1/attendance_records?${SCOPE}&select=*`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${REST_URL}/rest/v1/profiles?${SCOPE}&select=display_name,authority_tier,function_tags,last_seen_at`, { headers }).then(r => r.ok ? r.json() : []),
      // Finished entries only: an EN Helper entry with questions left doesn't
      // count until they're answered (complete is true for every typed one).
      fetch(`${REST_URL}/rest/v1/notebook_entries?${SCOPE}&complete=not.is.false&select=username,meeting_date`, { headers }).then(r => r.ok ? r.json() : []),
      loadStandingNotices(SCOPE),
    ])).then(([s, r, p, n, st]) => {
      setSessions(s)
      setRecords(r)
      setProfiles(p)
      setStanding(st)
      const by = {}
      for (const e of n || []) (by[e.meeting_date] ||= new Set()).add(e.username)
      setNotebookByDate(by)
    }).catch(() => {})
  }, [])

  // Refresh profiles every 10s to keep last_seen_at current
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${REST_URL}/rest/v1/profiles?${SCOPE}&select=display_name,authority_tier,function_tags,last_seen_at`, { headers: REST_HEADERS })
        .then(r => r.ok ? r.json() : null)
        .then(p => { if (p) setProfiles(p) })
        .catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Real-time subscriptions
  //
  // Unfiltered, these delivered every team's sessions and records to every
  // open app: starting attendance on Radical made a session appear on Prime
  // Suspects, because the insert was broadcast to everyone listening.
  //
  // Realtime filters cannot express "is null", which is how Radical's own
  // rows are stored, so the check happens here instead — rowBelongs is the
  // same rule the queries use. DELETE is left alone: it carries only an id,
  // and dropping an id we never had is a no-op.
  useEffect(() => {
    const channel = supabase
      .channel('attendance-mgr-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, (payload) => {
        if (payload.eventType !== 'DELETE' && !rowBelongs(payload.new, myTeamNumber)) return
        if (payload.eventType === 'INSERT') {
          setSessions(prev => prev.some(s => s.id === payload.new.id) ? prev : [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setSessions(prev => prev.map(s => s.id === payload.new.id ? payload.new : s))
          // The open session too, so a meeting length typed on another
          // device changes the percentages on this one.
          setSelectedSession(prev => prev?.id === payload.new.id ? payload.new : prev)
        } else if (payload.eventType === 'DELETE') {
          setSessions(prev => prev.filter(s => s.id !== payload.old.id))
          setSelectedSession(prev => prev?.id === payload.old.id ? null : prev)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, (payload) => {
        if (payload.eventType !== 'DELETE' && !rowBelongs(payload.new, myTeamNumber)) return
        if (payload.eventType === 'INSERT') {
          setRecords(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setRecords(prev => prev.map(r => r.id === payload.new.id ? payload.new : r))
        } else if (payload.eventType === 'DELETE') {
          setRecords(prev => prev.filter(r => r.id !== payload.old.id))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [myTeamNumber])

  const showFeedback = (msg) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 3000)
  }

  // All profiles with a display name (exclude explicit guests)
  const teamMembers = profiles.filter(p => p.display_name && p.authority_tier !== 'guest' && !excludeFromAttendance(p))

  // Who's been seen recently (heartbeat pings every 30s; allow a couple missed)
  const recentlySeen = (name) => {
    const p = profiles.find(pr => pr.display_name === name)
    if (!p?.last_seen_at) return false
    return (Date.now() - new Date(p.last_seen_at).getTime()) < 90 * 1000
  }

  // Pull today's session (plus its records) straight from the server and show it.
  // Used whenever a session already exists, so a second tap opens the real one
  // instead of creating a rival.
  const openExistingSession = async (existing) => {
    setSessions(prev => prev.some(s => s.id === existing.id) ? prev : [existing, ...prev])
    try {
      const res = await fetch(`${REST_URL}/rest/v1/attendance_records?${SCOPE}&session_id=eq.${existing.id}&select=*`, { headers: REST_HEADERS })
      if (res.ok) {
        const rows = await res.json()
        setRecords(prev => {
          const known = new Set(prev.map(r => r.id))
          return [...prev, ...rows.filter(r => !known.has(r.id))]
        })
      }
    } catch {}
    setSelectedSession(existing)
    setEditing(true)
  }

  const handleTakeAttendance = async (forDate) => {
    if (!hasLeadTag) return
    // Repeat taps used to each create their own session (12 duplicates for one
    // meeting), because the guard below ran before the awaits and the button
    // stayed live the whole time.
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    try {
      // One session per day, full stop. A second one on the same date counts
      // everybody twice, so if today already has one we say so and open it
      // rather than offering to start another.
      const wantedDate = typeof forDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(forDate) ? forDate : null
      const today = wantedDate || todayStr()

      const localDupe = sessions.find(s => s.session_date === today)
      if (localDupe) {
        showFeedback(`There's already a session for ${today}. Opening it.`)
        await openExistingSession(localDupe)
        return
      }

      try {
        const { session, records: sessRecords, created, profiles: fresh } =
          await ensureSessionForDate({ date: today, username, teamNumber: myTeamNumber })
        if (fresh) setProfiles(fresh)
        if (!created) {
          showFeedback(`There's already a session for ${today}. Opening it.`)
          await openExistingSession(session)
          return
        }
        setSessions(prev => prev.some(s => s.id === session.id) ? prev : [session, ...prev])
        setRecords(prev => {
          const known = new Set(prev.map(r => r.id))
          return [...prev, ...sessRecords.filter(r => !known.has(r.id))]
        })
        const presentCount = sessRecords.filter(r => r.status === 'present').length
        showFeedback(`Session created! ${presentCount}/${sessRecords.length} present.`)
        setSelectedSession(session)
        setEditing(true)
      } catch (err) {
        console.error('Failed to take attendance:', err)
        if (err.session) setSessions(prev => prev.some(s => s.id === err.session.id) ? prev : [err.session, ...prev])
        showFeedback(err.message.startsWith('Error') ? err.message : 'Error: ' + err.message)
      }
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }

  // Meetings get logged on the wrong day — someone opens attendance the
  // morning after, or a session is started early. The date is what every
  // percentage and streak is counted against, so it has to be correctable.
  // A reason travels with the absence rather than living in someone's memory.
  // The filed notice is used when there is one; this is for the rest.
  // Excusing is a lead's call, made deliberately. An absence stays unexcused
  // until one of them says otherwise — filing a notice asks, it doesn't decide.
  // A lead can correct what somebody filed — times change, reasons get typed
  // in a hurry. on_time is deliberately left alone: whether they told us in
  // time is a fact about when they filed, not something to be edited after.
  const patchNotice = async (notice, fields) => {
    if (!hasLeadTag) return
    setNotices(prev => prev.map(n => n.id === notice.id ? { ...n, ...fields } : n))
    try {
      await fetch(`${REST_URL}/rest/v1/absence_notices?id=eq.${notice.id}`, {
        method: 'PATCH', headers: REST_JSON, body: JSON.stringify(fields),
      })
    } catch (err) {
      console.error('Failed to change the notice:', err)
    }
  }

  const deleteNotice = async (notice) => {
    if (!hasLeadTag) return
    if (!window.confirm(`Remove ${notice.username}'s notice for this meeting?`)) return
    setNotices(prev => prev.filter(n => n.id !== notice.id))
    try {
      await fetch(`${REST_URL}/rest/v1/absence_notices?id=eq.${notice.id}`, {
        method: 'DELETE', headers: REST_HEADERS,
      })
    } catch (err) {
      console.error('Failed to remove the notice:', err)
    }
  }

  const setExcused = async (record, excused) => {
    if (!hasLeadTag) return
    const status = excused ? 'excused' : 'absent'
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status, marked_by: username } : r))
    try {
      await fetch(`${REST_URL}/rest/v1/attendance_records?id=eq.${record.id}`, {
        method: 'PATCH', headers: REST_JSON,
        body: JSON.stringify({ status, marked_by: username }),
      })
    } catch (err) {
      console.error('Failed to change excused:', err)
    }
  }

  // Minutes late or left early, on the record itself. The screen updates at
  // once; the server catches up, and other open apps hear about it through
  // the records channel above.
  const setTiming = async (record, patch) => {
    if (!hasLeadTag || !record || record.virtual) return
    setRecords(prev => prev.map(r => r.id === record.id ? applyTimingPatch(r, patch) : r))
    try {
      await saveRecordTiming(record.id, patch)
    } catch (err) {
      console.error('Failed to save late/left-early minutes:', err)
    }
  }

  // How long this meeting ran. Blank goes back to the usual length for the day.
  const setSessionDurationMin = async (session, min) => {
    if (!hasLeadTag || !session) return
    const duration_min = Number(min) > 0 ? Math.round(Number(min)) : null
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, duration_min } : s))
    setSelectedSession(prev => prev?.id === session.id ? { ...prev, duration_min } : prev)
    try {
      await saveSessionDuration(session.id, min)
    } catch (err) {
      console.error('Failed to save the meeting length:', err)
    }
  }

  // A standing notice is the person's own to keep or drop, but a lead can
  // clear one that no longer applies.
  const deleteStanding = async (s) => {
    if (!hasLeadTag) return
    if (!window.confirm(`Remove ${s.username}'s standing notice for every ${WEEKDAY_NAMES[s.weekday]}?`)) return
    setStanding(prev => prev.filter(x => x.id !== s.id))
    try {
      await fetch(`${REST_URL}/rest/v1/standing_notices?id=eq.${encodeURIComponent(s.id)}`, {
        method: 'DELETE', headers: REST_HEADERS,
      })
    } catch (err) {
      console.error('Failed to remove the standing notice:', err)
    }
  }

  const setReason = async (record, text) => {
    if (!hasLeadTag) return
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, reason: text } : r))
    try {
      await fetch(`${REST_URL}/rest/v1/attendance_records?id=eq.${record.id}`, {
        method: 'PATCH', headers: REST_JSON, body: JSON.stringify({ reason: text }),
      })
    } catch (err) {
      // The column may not exist yet (supabase/attendance_reason.sql).
      console.error('Failed to save the reason:', err)
    }
  }

  const handleChangeDate = async (nextDate) => {
    if (!hasLeadTag) return
    if (!nextDate || !selectedSession || nextDate === selectedSession.session_date) return
    // Two sessions on one day would count everybody twice.
    const clash = sessions.find(s => s.id !== selectedSession.id && s.session_date === nextDate)
    if (clash) {
      window.alert('There is already an attendance session on that date. Delete one of them first, or pick another day.')
      return
    }
    const previous = selectedSession.session_date
    const apply = (date) => {
      setSessions(prev => prev
        .map(s => s.id === selectedSession.id ? { ...s, session_date: date } : s)
        .sort((a, b) => (a.session_date < b.session_date ? 1 : -1)))
      setSelectedSession(prev => prev ? { ...prev, session_date: date } : prev)
    }
    apply(nextDate)
    try {
      const res = await fetch(`${REST_URL}/rest/v1/attendance_sessions?id=eq.${selectedSession.id}`, {
        method: 'PATCH', headers: REST_JSON,
        body: JSON.stringify({ session_date: nextDate }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to change the session date:', err)
      apply(previous)
      window.alert("Couldn't change the date. Check your connection and try again.")
    }
  }

  const handleDeleteSession = async (sessionId) => {
    if (!hasLeadTag) return
    if (!window.confirm('Delete this attendance session? This cannot be undone.')) return
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    setRecords(prev => prev.filter(r => r.session_id !== sessionId))
    if (selectedSession?.id === sessionId) {
      setSelectedSession(null)
      setEditing(false)
    }
    try {
      await fetch(`${REST_URL}/rest/v1/attendance_sessions?id=eq.${sessionId}`, {
        method: 'DELETE', headers: REST_HEADERS,
      })
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  const handleToggleStatus = async (record) => {
    if (!hasLeadTag) return
    // A "no record" placeholder (member added after this meeting) has no DB row
    // yet — the first tap creates one, marked present, then it cycles normally.
    if (record.virtual) {
      const newRec = stampTeam({
        id: genId(),
        session_id: record.session_id,
        username: record.username,
        status: 'present',
        marked_by: username,
        created_at: new Date().toISOString(),
      }, myTeamNumber)
      setRecords(prev => [...prev, newRec])
      try {
        await fetch(`${REST_URL}/rest/v1/attendance_records`, {
          method: 'POST', headers: REST_JSON, body: JSON.stringify(newRec),
        })
      } catch (err) { console.error('Failed to create record:', err) }
      return
    }

    // Present and absent only. Excusing is its own button beside this one,
    // because it is a decision a lead makes with a reason attached — not a
    // third stop you pass through while tapping. Tapping an already-excused
    // pill (not in the cycle, so indexOf is -1) brings them back to present.
    const cycle = ['present', 'absent']
    const nextIdx = (cycle.indexOf(record.status) + 1) % cycle.length
    const newStatus = cycle[nextIdx]

    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: newStatus, marked_by: username } : r))
    try {
      await fetch(`${REST_URL}/rest/v1/attendance_records?id=eq.${record.id}`, {
        method: 'PATCH', headers: REST_JSON,
        body: JSON.stringify({ status: newStatus, marked_by: username }),
      })
    } catch (err) {
      console.error('Failed to update record:', err)
    }
  }

  const handleAddPerson = async (personName, sessionId) => {
    const existing = records.find(r => r.session_id === sessionId && r.username === personName)
    if (existing) {
      showFeedback(`${personName} is already in this session.`)
      return
    }
    const record = stampTeam({
      id: genId(),
      session_id: sessionId,
      username: personName,
      status: 'present',
      marked_by: username,
      created_at: new Date().toISOString(),
    }, myTeamNumber)
    setRecords(prev => [...prev, record])
    setAddingUser(false)
    try {
      await fetch(`${REST_URL}/rest/v1/attendance_records`, {
        method: 'POST', headers: REST_JSON, body: JSON.stringify(record),
      })
    } catch (err) {
      console.error('Failed to add person:', err)
    }
  }

  const handleRemoveRecord = async (recordId) => {
    setRecords(prev => prev.filter(r => r.id !== recordId))
    try {
      await fetch(`${REST_URL}/rest/v1/attendance_records?id=eq.${recordId}`, {
        method: 'DELETE', headers: REST_HEADERS,
      })
    } catch (err) {
      console.error('Failed to remove record:', err)
    }
  }

  // Show every current team member on each meeting — real records as-is, plus a
  // neutral "no record" row for anyone (e.g. members added after the meeting was
  // logged) who doesn't have one yet. This way new members appear on all past
  // meetings automatically, ready for a lead to mark.
  const sessionRecords = selectedSession
    ? (() => {
        const sid = selectedSession.id
        // Who belongs in this session depends on whether it is today's.
        //
        // Today's: the live roster only. Somebody who has left shouldn't be
        // standing in the current meeting waiting to be marked.
        //
        // A past meeting: everyone who has a record, roster or not. They were
        // there. Filtering those out hid people the moment they moved teams —
        // Shraddha's records survived the move to Prime Suspects and then
        // vanished from Radical's past meetings anyway, which is the same as
        // rewriting them, and exactly what keeping the records was meant to
        // prevent.
        //
        // Guarded on profiles.length: before they load, every record would
        // look like a stranger and the session would come up empty.
        const roster = new Set(teamMembers.map(m => m.display_name))
        const isTodaysSession = (selectedSession.session_date || '') === todayStr()
        const real = records
          .filter(r => r.session_id === sid)
          .filter(r => !isTodaysSession || profiles.length === 0 || roster.has(r.username))
        const haveRecord = new Set(real.map(r => r.username))
        const virtuals = teamMembers
          .filter(m => !haveRecord.has(m.display_name))
          .map(m => ({
            id: `virtual_${sid}_${m.display_name}`,
            session_id: sid,
            username: m.display_name,
            status: 'no record',
            virtual: true,
          }))
        return [...real, ...virtuals].sort((a, b) => a.username.localeCompare(b.username))
      })()
    : []

  // Marker on marked_by that means "this absence came from the rule, not from a
  // person". Only those can be won back — if a lead marked you absent because
  // you weren't there, writing an entry afterwards doesn't overturn them.
  const RULE = 'notebook-rule'

  const notebookDiff = (session) => {
    if (!session) return { toAbsent: [], toPresent: [] }
    const wrote = notebookByDate[session.session_date] || new Set()
    const real = records.filter(r => r.session_id === session.id)
    return {
      toAbsent: real.filter(r => r.status === 'present' && !wrote.has(r.username)),
      toPresent: real.filter(r => r.status === 'absent' && r.marked_by === RULE && wrote.has(r.username)),
    }
  }

  const applyNotebookRule = async (session = selectedSession, quiet = false) => {
    if (applyingRule || !session) return
    const { toAbsent, toPresent } = notebookDiff(session)
    if (toAbsent.length === 0 && toPresent.length === 0) return
    setApplyingRule(true)
    // Absences the rule creates are stamped with RULE so they stay reversible.
    // Winning one back hands it to the person who applied it, so it can't be
    // won back twice over.
    const changed = new Map()
    toAbsent.forEach(r => changed.set(r.id, ['absent', RULE]))
    toPresent.forEach(r => changed.set(r.id, ['present', username]))
    setRecords(prev => prev.map(r => changed.has(r.id)
      ? { ...r, status: changed.get(r.id)[0], marked_by: changed.get(r.id)[1] } : r))
    const patch = async (list, status, by) => {
      if (list.length === 0) return
      await fetch(`${REST_URL}/rest/v1/attendance_records?id=in.(${list.map(r => r.id).join(',')})`, {
        method: 'PATCH', headers: REST_JSON,
        body: JSON.stringify({ status, marked_by: by }),
      })
    }
    try {
      await Promise.all([patch(toAbsent, 'absent', RULE), patch(toPresent, 'present', username)])
      if (!quiet) showFeedback([
        toAbsent.length ? `${toAbsent.length} marked absent` : '',
        toPresent.length ? `${toPresent.length} won back` : '',
      ].filter(Boolean).join(' · '))
    } catch (err) {
      console.error('Failed to apply the notebook rule:', err)
      showFeedback('Could not apply it — try again')
    } finally {
      setApplyingRule(false)
    }
  }

  // The deadline is the end of the meeting day. Once a day is over, anyone
  // without an entry for it is absent — so any past session a lead opens gets
  // settled automatically. Today's is left alone; there's still time to write.
  // A missing absence_notices table (the SQL not run yet) just means no notices.
  const noticeDate = selectedSession?.session_date
  useEffect(() => {
    setNotices([])
    setNoticesFor(null)
    if (!noticeDate) return
    let cancelled = false
    fetch(`${REST_URL}/rest/v1/absence_notices?${SCOPE}&meeting_date=eq.${noticeDate}&select=*`, { headers: REST_HEADERS })
      .then(r => (r.ok ? r.json() : []))
      .then(rows => {
        if (cancelled) return
        setNotices(Array.isArray(rows) ? rows : [])
        setNoticesFor(noticeDate)
      })
      .catch(() => { if (!cancelled) setNoticesFor(noticeDate) })
    return () => { cancelled = true }
  }, [noticeDate])

  // Standing notices that apply to the open session's weekday, for people who
  // haven't filed something more specific for this exact day.
  const standingToday = selectedSession
    ? standing.filter(s => Number(s.weekday) === weekdayOf(selectedSession.session_date)
        && !notices.some(n => n.username === s.username))
    : []

  // A filed notice has to turn into real minutes, or it is just a message
  // nobody acted on. Starting a session writes them on the records (see
  // lib/attendanceSession); this catches whatever came after — a notice
  // filed the same day, a standing notice added since, a person added to the
  // meeting by hand.
  //
  // Only fills a blank. Once a lead has typed a number for someone, or ticked
  // excused, their judgement stands and the notice never overwrites it.
  // appliedRef keeps a notice from being re-applied after a lead deliberately
  // clears it back to zero. Waits for the day's notices to have loaded, so a
  // standing notice never wins over an "I'm out this Thursday" that simply
  // hadn't arrived yet.
  const appliedRef = useRef(new Set())
  useEffect(() => {
    if (!selectedSession || !hasLeadTag) return
    if (noticesFor !== selectedSession.session_date) return
    const sid = selectedSession.id
    const date = selectedSession.session_date
    for (const r of records) {
      if (r.session_id !== sid || r.status !== 'present') continue
      const want = filedTiming({
        sessionDate: date, username: r.username, notices, standing,
        durationMin: selectedSession.duration_min,
      })
      if (!want) continue
      const mark = `${r.id}|${want.late_min}|${want.early_min}`
      if (appliedRef.current.has(mark)) continue
      appliedRef.current.add(mark)
      if (timingTouched(r)) continue
      setTiming(r, timingColumns(want))
    }
  }, [selectedSession, notices, noticesFor, standing, records, hasLeadTag]) // eslint-disable-line

  const settledRef = useRef(false)
  useEffect(() => {
    if (settledRef.current || !hasLeadTag) return
    if (sessions.length === 0 || records.length === 0) return
    if (Object.keys(notebookByDate).length === 0) return
    const today = todayStr()
    const past = sessions.filter(s => s.session_date < today)
    const pending = past.filter(s => {
      const d = notebookDiff(s)
      return d.toAbsent.length > 0 || d.toPresent.length > 0
    })
    if (pending.length === 0) return
    settledRef.current = true
    ;(async () => { for (const s of pending) await applyNotebookRule(s, true) })()
  }, [sessions, records, notebookByDate, hasLeadTag]) // eslint-disable-line

  const getSessionSummary = (sessionId) => {
    const sr = records.filter(r => r.session_id === sessionId)
    const present = sr.filter(r => r.status === 'present').length
    return { present, total: sr.length }
  }

  // A scan on this screen shows up straight away; scans made elsewhere arrive
  // through the realtime channel above.
  const handleScanned = ({ record, session }) => {
    if (session) setSessions(prev => prev.some(s => s.id === session.id) ? prev : [session, ...prev])
    if (record) setRecords(prev => prev.some(r => r.id === record.id)
      ? prev.map(r => r.id === record.id ? { ...r, ...record } : r)
      : [...prev, record])
  }

  if (mode === 'kiosk' && hasLeadTag) {
    return <BadgeKiosk onExit={() => setMode('list')} onScanned={handleScanned} />
  }
  if (mode === 'badges' && hasLeadTag) {
    return <BadgeAssign onBack={() => setMode('list')} />
  }

  // Detail view for a specific session
  if (selectedSession) {
    const usersInSession = sessionRecords.map(r => r.username)
    const addableUsers = profiles
      .filter(p => p.authority_tier !== 'guest' && !excludeFromAttendance(p) && !usersInSession.includes(p.display_name))
      .map(p => p.display_name)
      .sort()

    return (
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-lg mx-auto space-y-4">
          <button
            onClick={() => { setSelectedSession(null); setEditing(false); setAddingUser(false) }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Sessions
          </button>

          <div className="flex items-center justify-between">
            <div>
              {editing && hasLeadTag ? (
                <>
                  <input
                    type="date"
                    value={selectedSession.session_date}
                    onChange={(e) => handleChangeDate(e.target.value)}
                    className="text-lg font-bold text-gray-800 bg-white border rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    The day this meeting counts as — attendance rates follow it.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-800">
                    {new Date(selectedSession.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                  </h2>
                  <p className="text-xs text-gray-400">Created by {selectedSession.created_by}</p>
                </>
              )}
            </div>
            {/* Anyone can read a session; changing one is for leads and
                co-leads. hasLeadTag already covers every Co- role. */}
            {hasLeadTag && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className={`p-2 rounded-lg transition-colors ${editing ? 'bg-brand-blue text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  title={editing ? 'Done editing' : 'Edit'}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteSession(selectedSession.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete session"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <div className="text-center text-green-600 font-medium animate-pulse text-sm">{feedback}</div>
          )}

          {(notices.length > 0 || standingToday.length > 0) && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Said they'd be out ({notices.length + standingToday.length})
              </h3>
              <div className="space-y-2">
                {/* In-time notices first — those are the ones a lead is deciding on. */}
                {[...notices].sort((a, b) => (b.on_time ? 1 : 0) - (a.on_time ? 1 : 0)).map(n => (
                  <div key={n.id} className="flex items-start gap-2 text-xs">
                    <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-semibold ${
                      n.on_time ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {n.on_time ? 'in time' : 'late'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700">
                        {n.username}
                        {(() => {
                          if (n.kind !== 'out') return null
                          const rec = sessionRecords.find(r => r.username === n.username && !r.virtual)
                          if (!rec || rec.status !== 'present') return null
                          return (
                            <span className="ml-1.5 font-normal text-[11px] text-amber-700">
                              · marked present
                              {editing && hasLeadTag && (
                                <button
                                  onClick={() => setExcused(rec, !!n.on_time)}
                                  className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 font-semibold"
                                >
                                  mark {n.on_time ? 'excused' : 'absent'}
                                </button>
                              )}
                            </span>
                          )
                        })()}
                      </p>
                      {/* Which kind, so it's obvious at a glance whether this
                          is a whole meeting or a chunk of one. */}
                      <p className="text-gray-500">
                        {n.kind === 'partial'
                          ? `there ${n.arrive_at || '?'} – ${n.leave_at || '?'}`
                            + (n.late_min ? ` · ${n.late_min} min late` : '')
                            + (n.early_min ? ` · left ${n.early_min} min early` : '')
                          : 'out for the meeting'}
                      </p>
                      {editing && hasLeadTag ? (
                        <div className="space-y-1 mt-0.5">
                          {n.kind === 'partial' && (
                            <div className="flex items-center gap-1">
                              <input type="time" step="300" defaultValue={n.arrive_at || ''}
                                onBlur={e => e.target.value !== (n.arrive_at || '') && patchNotice(n, { arrive_at: e.target.value })}
                                className="border rounded px-1 py-0.5 text-[11px]" />
                              <span className="text-gray-400 text-[11px]">–</span>
                              <input type="time" step="300" defaultValue={n.leave_at || ''}
                                onBlur={e => e.target.value !== (n.leave_at || '') && patchNotice(n, { leave_at: e.target.value })}
                                className="border rounded px-1 py-0.5 text-[11px]" />
                            </div>
                          )}
                          <input defaultValue={n.reason || ''}
                            onBlur={e => e.target.value !== (n.reason || '') && patchNotice(n, { reason: e.target.value })}
                            placeholder="Reason"
                            className="w-full border rounded px-1.5 py-0.5 text-[11px]" />
                          <button onClick={() => deleteNotice(n)}
                            className="text-[11px] text-gray-400 hover:text-red-500">Remove</button>
                        </div>
                      ) : (
                        <p className="text-gray-400 break-words">{n.reason}</p>
                      )}
                      {n.hours_before != null && (
                        <p className="text-gray-300">{Math.floor(n.hours_before)}h before</p>
                      )}
                    </div>
                  </div>
                ))}
                {/* Standing arrangements: filed once, apply every week. Always
                    in time, so always excused. */}
                {standingToday.map(s => (
                  <div key={s.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-semibold bg-brand-blue/40 text-gray-700">
                      every {WEEKDAY_NAMES[s.weekday].slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700">{s.username}</p>
                      <p className="text-gray-500">
                        {s.kind === 'partial'
                          ? `there ${s.arrive_at || '?'} – ${s.leave_at || '?'}`
                          : 'out for the meeting'}
                      </p>
                      <p className="text-gray-400 break-words">{s.reason}</p>
                      {editing && hasLeadTag && (
                        <button onClick={() => deleteStanding(s)}
                          className="text-[11px] text-gray-400 hover:text-red-500">Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                Minutes from a notice are written on the person's record when the meeting starts; a late notice counts absent.
                {editing && hasLeadTag && ' Edit mode: you can correct times and reasons here.'}
              </p>
            </section>
          )}

          {/* Today's session hasn't hit its deadline yet, so the rule is offered
              rather than applied. Past days settle themselves on load. */}
          {hasLeadTag && (() => {
            const { toAbsent, toPresent } = notebookDiff(selectedSession)
            if (toAbsent.length === 0 && toPresent.length === 0) return null
            const bits = [
              toAbsent.length ? `${toAbsent.length} without an entry → absent` : '',
              toPresent.length ? `${toPresent.length} wrote one late → present` : '',
            ].filter(Boolean).join(' · ')
            return (
              <button
                onClick={() => applyNotebookRule()}
                disabled={applyingRule}
                className="w-full px-4 py-2.5 rounded-xl bg-brand-silver/30 hover:bg-brand-silver/50 disabled:opacity-50 transition-colors text-sm font-semibold text-gray-700 text-left"
              >
                {applyingRule ? 'Applying…' : 'Match attendance to the notebook'}
                <span className="block text-xs font-normal text-gray-500 mt-0.5">{bits}</span>
              </button>
            )
          })()}

          {hasLeadTag && selectedSession.session_date === todayStr() && (
            <BadgeScanInput onScanned={handleScanned} />
          )}

          <div className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              {sessionRecords.filter(r => r.status === 'present').length} present / {sessionRecords.filter(r => r.status !== 'no record').length} marked
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              Meeting length
              <input
                key={`${selectedSession.id}:${selectedSession.duration_min ?? ''}`}
                type="number" min="1"
                defaultValue={sessionDuration(selectedSession)}
                disabled={!hasLeadTag || !editing}
                onBlur={e => {
                  if (Number(e.target.value) !== sessionDuration(selectedSession)) setSessionDurationMin(selectedSession, e.target.value)
                }}
                className="w-16 text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent disabled:bg-gray-50"
              /> min
            </label>
          </div>

          <div className="space-y-2">
            {sessionRecords.map(r => {
              const present = r.status === 'present'
              const t = recordTiming(r)
              const pct = presencePct(r, selectedSession)
              const open = expandedRec === r.id
              const tag = (mins, exc, label) => mins ? `${label} ${mins}m${exc ? ' (exc)' : ''}` : ''
              const timingLine = [tag(t.lateMin, t.lateExcused, 'late'), tag(t.earlyMin, t.earlyExcused, 'left')].filter(Boolean).join(' · ')
              return (
                <div key={r.id} className="bg-white rounded-xl shadow-sm">
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-700">{r.username}</span>
                      {r.badge_scan && (
                        <div className="text-[11px] text-gray-400 mt-0.5 font-mono" title="Scanned in by badge">
                          {'\u{1FAAA}'} {r.badge_scan}
                        </div>
                      )}
                      {present && timingLine && <div className="text-[11px] text-gray-400 mt-0.5">{timingLine}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {present && (
                        <span className={`text-xs font-bold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{pct}%</span>
                      )}
                      <button
                        onClick={() => editing && handleToggleStatus(r)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-500'} ${editing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                      >
                        {r.status}
                      </button>
                      {/* One tap either way, rather than cycling through
                          present to get there. */}
                      {editing && !present && r.status !== 'no record' && (
                        <button
                          onClick={() => setExcused(r, r.status !== 'excused')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                            r.status === 'excused'
                              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {r.status === 'excused' ? 'excused' : 'excuse'}
                        </button>
                      )}
                      {editing && present && (
                        <button
                          onClick={() => setExpandedRec(open ? null : r.id)}
                          title="Late / left early"
                          className={`p-1 rounded-lg transition-colors ${open ? 'bg-brand-blue text-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                        >
                          <Clock size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  {editing && !present && !notices.some(n => n.username === r.username) && (
                    <div className="px-3 pb-3 -mt-1">
                      <input
                        defaultValue={r.reason || ''}
                        onBlur={e => { if (e.target.value !== (r.reason || '')) setReason(r, e.target.value) }}
                        placeholder="Why were they gone?"
                        className="w-full text-xs border rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                      />
                    </div>
                  )}
                  {editing && present && open && (
                    <div className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 shrink-0">Late (min)</span>
                        <input type="number" min="0" value={t.lateMin || ''} placeholder="0"
                          onChange={e => setTiming(r, { lateMin: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-20 text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
                        <label className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
                          <input type="checkbox" checked={!!t.lateExcused} onChange={e => setTiming(r, { lateExcused: e.target.checked })} /> excused
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 shrink-0">Left early (min)</span>
                        <input type="number" min="0" value={t.earlyMin || ''} placeholder="0"
                          onChange={e => setTiming(r, { earlyMin: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-20 text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
                        <label className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
                          <input type="checkbox" checked={!!t.earlyExcused} onChange={e => setTiming(r, { earlyExcused: e.target.checked })} /> excused
                        </label>
                      </div>
                      <p className="text-[11px] text-gray-400">Present for <b>{pct}%</b> of the {sessionDuration(selectedSession)}-min meeting.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {editing && (
            <div>
              {addingUser ? (
                <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-gray-500">Add a person</p>
                  {addableUsers.length === 0 ? (
                    <p className="text-xs text-gray-400">All team members are already in this session.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {addableUsers.map(name => (
                        <button
                          key={name}
                          onClick={() => handleAddPerson(name, selectedSession.id)}
                          className="px-2 py-1 text-xs rounded-lg bg-brand-blue/30 hover:bg-brand-blue/50 text-gray-700 transition-colors"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setAddingUser(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingUser(true)}
                  className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1"
                >
                  <UserPlus size={14} /> Add Person
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Session list view
  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="max-w-lg mx-auto space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-brand-blue-dark" />
          <h2 className="text-lg font-bold text-gray-800">Attendance Manager</h2>
        </div>

        {feedback && (
          <div className="text-center text-green-600 font-medium animate-pulse text-sm">{feedback}</div>
        )}

        {hasLeadTag && (
          <button
            onClick={() => handleTakeAttendance()}
            disabled={creating}
            className="w-full px-4 py-3 rounded-xl bg-brand-blue/40 hover:bg-brand-blue/60 disabled:opacity-50 disabled:hover:bg-brand-blue/40 disabled:cursor-not-allowed transition-colors text-sm font-semibold text-gray-700"
          >
            {creating ? 'Starting\u2026' : "Start Today's Session"}
          </button>
        )}
        <p className="text-xs text-gray-400 text-center -mt-2">
          {(() => {
            const online = teamMembers.filter(p => recentlySeen(p.display_name))
            return online.length > 0
              ? `${online.length} online: ${online.map(p => p.display_name).join(', ')}`
              : 'No users detected online yet'
          })()}
          {' — '}leads can edit after.
        </p>

        {hasLeadTag && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('kiosk')}
              className="px-3 py-2 rounded-xl bg-white shadow-sm hover:shadow-md transition-all text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5"
            >
              <ScanLine size={14} /> Badge Kiosk
            </button>
            <button
              onClick={() => setMode('badges')}
              className="px-3 py-2 rounded-xl bg-white shadow-sm hover:shadow-md transition-all text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5"
            >
              <Contact size={14} /> Assign Badges
            </button>
          </div>
        )}
        {hasLeadTag && <BadgeScanInput onScanned={handleScanned} />}

        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No attendance sessions yet.</p>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500">Past Sessions ({sessions.length})</h3>
            {sessions.map(s => {
              const { present, total } = getSessionSummary(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className="w-full bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-all text-left flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-400">by {s.created_by}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-600">{present}/{total}</span>
                    <p className="text-xs text-gray-400">present</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
