import { useState, useEffect, useMemo } from 'react'
import { lazyHeadersWith, lazyRestHeaders } from '../lib/restHeaders'
import { teamScope, stampTeam } from '../lib/teamScope'
import { Pencil, Check as CheckIcon, Trash2, ArrowLeft, CalendarX, Clock, Check, AlertTriangle, Repeat } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { defaultDurationForDate, defaultStartForDate, WEEKDAY_NAMES, weekdayOf, loadStandingNotices } from '../lib/attendanceTiming'
import { alertLeadsOfLateNotice } from '../lib/lateNoticeAlert'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = lazyRestHeaders
const JSON_HEADERS = lazyHeadersWith({ 'Content-Type': 'application/json' })
// The rule. Filing this far ahead is what makes a notice count for anything.
const NOTICE_HOURS = 24

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const pretty = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`
}

const genId = () => String(Date.now()) + Math.random().toString(36).slice(2, 8)

const prettyDay = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric' })

// A date the browser's date input will accept, in local time — toISOString()
// is UTC and rolls over to tomorrow after about 7pm here.
const localDay = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Lives inside the Attendance tab, so it takes `embedded` and drops its own
// page chrome — no back button, no outer padding, no duplicate heading.
export default function AbsenceNotice({ onBack, embedded = false }) {
  const { username } = useUser()
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [events, setEvents] = useState([])
  const [mine, setMine] = useState([])
  // Standing notices: "every Thursday", filed once. Yours only, here.
  const [standing, setStanding] = useState([])
  const [weekly, setWeekly] = useState(false)
  const [date, setDate] = useState(localDay(2))
  // Either they're not coming at all, or they're telling us the window they
  // will be there for. Two times, said the way people say it.
  const [outAll, setOutAll] = useState(false)
  const [arriveAt, setArriveAt] = useState('')
  const [leaveAt, setLeaveAt] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingMine, setEditingMine] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const today = localDay()
    fetch(`${REST_URL}/rest/v1/calendar_events?${SCOPE}&select=id,name,date_key,start_time,event_type&date_key=gte.${today}&order=date_key`,
      { headers: HEADERS })
      .then(r => (r.ok ? r.json() : []))
      .then(rows => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [])

  const loadMine = () => {
    if (!username) return
    fetch(`${REST_URL}/rest/v1/absence_notices?${SCOPE}&username=eq.${encodeURIComponent(username)}&select=*&order=meeting_date.desc`,
      { headers: HEADERS })
      .then(r => (r.ok ? r.json() : []))
      .then(rows => setMine(Array.isArray(rows) ? rows : []))
      .catch(() => {})
    loadStandingNotices(SCOPE)
      .then(rows => setStanding(rows.filter(r => r.username === username)))
      .catch(() => {})
  }
  useEffect(loadMine, [username])

  const dayName = date ? WEEKDAY_NAMES[weekdayOf(date)] : 'week'

  // The meeting being reported on, and therefore what the 24 hours counts
  // against: the calendar's start time if the day is on there, else the usual one.
  const target = useMemo(() => {
    const ev = events.find(e => e.date_key === date && e.event_type === 'meeting')
      || events.find(e => e.date_key === date)
    const time = (ev?.start_time || defaultStartForDate(date)).slice(0, 5)
    return { ev, at: new Date(`${date}T${time}:00`), time, assumed: !ev?.start_time }
  }, [events, date])

  const hoursAhead = useMemo(
    () => (target.at - new Date()) / 3600000,
    [target, date]) // eslint-disable-line

  // The meeting's own window, which the two boxes default to and are measured
  // against. Same length the attendance screen uses.
  const meeting = useMemo(() => {
    const start = target.at
    const mins = defaultDurationForDate(date)
    return { start, end: new Date(start.getTime() + mins * 60000), mins }
  }, [target, date])

  // Start people at the meeting's own hours, so they only change the end they
  // need to — and an untouched box never silently claims missed time.
  useEffect(() => {
    setArriveAt(hhmm(meeting.start))
    setLeaveAt(hhmm(meeting.end))
  }, [meeting.start, meeting.end])

  // The window turned into what attendance records: minutes late off the
  // start, minutes early off the end.
  const window_ = useMemo(() => {
    if (outAll || !arriveAt || !leaveAt) return null
    const at = (t) => { const [h, m] = t.split(':').map(Number); const d = new Date(date + 'T00:00:00'); d.setHours(h, m || 0, 0, 0); return d }
    const a = at(arriveAt), l = at(leaveAt)
    const late = Math.max(0, Math.round((a - meeting.start) / 60000))
    const early = Math.max(0, Math.round((meeting.end - l) / 60000))
    const there = Math.max(0, Math.round((l - a) / 60000))
    return { a, l, late, early, there, backwards: l <= a,
             pct: Math.max(0, Math.min(100, Math.round((there / meeting.mins) * 100))) }
  }, [outAll, arriveAt, leaveAt, date, meeting])
  const inTime = hoursAhead >= NOTICE_HOURS
  const past = hoursAhead <= 0

  // Only for a meeting that hasn't happened yet. Once it has, the notice is
  // part of the record of that day — a lead can still remove it, but taking
  // back what you told everyone after the fact is a different thing from
  // fixing a mistake you just made.
  const canRemove = (n) => {
    try { return new Date(n.meeting_date + 'T23:59:59') > new Date() } catch { return false }
  }

  const removeMine = async (n) => {
    setMine(prev => prev.filter(x => x.id !== n.id))
    try {
      const res = await fetch(`${REST_URL}/rest/v1/absence_notices?id=eq.${n.id}`, {
        method: 'DELETE', headers: JSON_HEADERS,
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to remove notice:', err)
      setMine(prev => [n, ...prev])  // put it back rather than let it look gone
    }
  }

  // A standing notice is always yours to take back: it is about weeks that
  // haven't happened yet.
  const removeStanding = async (s) => {
    setStanding(prev => prev.filter(x => x.id !== s.id))
    try {
      const res = await fetch(`${REST_URL}/rest/v1/standing_notices?id=eq.${encodeURIComponent(s.id)}`, {
        method: 'DELETE', headers: JSON_HEADERS,
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to remove the standing notice:', err)
      setStanding(prev => [s, ...prev])
    }
  }

  const submit = async () => {
    setError('')
    // Everything is required. A half-filled notice is one a lead can't act on,
    // and they'd have to come and ask — which is the thing this is meant to
    // save. Checked in order, so the message points at the first gap.
    if (!date) { setError('Pick the day you\'ll miss.'); return }
    if (!outAll && (!arriveAt || !leaveAt)) { setError('Put in both times.'); return }
    if (!outAll && window_?.backwards) { setError("You'd be leaving before you arrive — check the times."); return }
    if (!outAll && window_ && window_.late === 0 && window_.early === 0) {
      setError("Those are the meeting's own hours, so there's nothing to report. Tick \u201cI won't be there at all\u201d if you're missing it.")
      return
    }
    if (!reason.trim()) { setError('Say why, even briefly — a lead has to make a call on it.'); return }
    setSaving(true)

    // "Every Thursday": one row per weekday, filed once, applied to every
    // session on that day from now on. Always in time, by definition.
    if (weekly) {
      const weekday = weekdayOf(date)
      const srow = stampTeam({
        id: genId(),
        username,
        weekday,
        kind: outAll ? 'out' : 'partial',
        arrive_at: outAll ? null : arriveAt,
        leave_at: outAll ? null : leaveAt,
        reason: reason.trim(),
      }, myTeamNumber)
      try {
        const res = await fetch(`${REST_URL}/rest/v1/standing_notices?on_conflict=username,weekday,team_number`, {
          method: 'POST',
          headers: { ...JSON_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(srow),
        })
        if (!res.ok) throw new Error(await res.text())
        setDone({ date, inTime: true, outAll, weekly: true, weekday })
        setReason('')
        setWeekly(false)
        loadMine()
      } catch (err) {
        console.error('Failed to file the standing notice:', err)
        setError("Couldn't save that. Check your connection and try again.")
      } finally {
        setSaving(false)
      }
      return
    }

    const row = {
      id: genId(),
      username,
      meeting_date: date,
      meeting_at: target.at.toISOString(),
      event_id: target.ev?.id || null,
      event_name: target.ev?.name || null,
      reason: reason.trim(),
      kind: outAll ? 'out' : 'partial',
      arrive_at: outAll ? null : arriveAt,
      leave_at: outAll ? null : leaveAt,
      late_min: outAll ? null : (window_ ? window_.late : null),
      early_min: outAll ? null : (window_ ? window_.early : null),
      hours_before: Math.round(hoursAhead * 10) / 10,
      on_time: inTime,
    }
    try {
      // Filing again for the same day corrects the first notice rather than
      // adding a second — but the clock restarts, so a late correction is late.
      const res = await fetch(`${REST_URL}/rest/v1/absence_notices?on_conflict=username,meeting_date,team_number`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(await res.text())
      // Only once it's actually stored, and only when it's late — an in-time
      // notice is seen when attendance is taken, which is soon enough.
      if (!inTime) {
        alertLeadsOfLateNotice({
          actor: username,
          date,
          hoursBefore: hoursAhead,
          outAll,
          reason: reason.trim(),
          arriveAt,
          leaveAt,
        })
      }
      setDone({ date, inTime, outAll })
      setReason('')
      loadMine()
    } catch (err) {
      console.error('Failed to file the notice:', err)
      setError("Couldn't save that. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell embedded={embedded} onBack={onBack}>

          {/* The tab it sits in already names it, so this header only belongs
              on the standalone page. */}
          {!embedded && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-yellow flex items-center justify-center shrink-0">
                <CalendarX size={20} className="text-gray-700" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800 leading-tight">Let us know you'll miss some</h1>
                <p className="text-xs text-gray-400">
                  Out, arriving late or leaving early — {NOTICE_HOURS} hours ahead and a lead can excuse it.
                </p>
              </div>
            </div>
          )}

          {/* The rule, up front. Reading it after being marked absent is no use. */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-snug">
              Under {NOTICE_HOURS} hours and it counts as an absence — that part isn't a
              judgement call, so file it as soon as you know.
            </p>
          </div>

          {done ? (
            <div className={`rounded-xl p-4 border ${done.inTime ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                {done.inTime
                  ? <Check size={16} className="text-green-600" />
                  : <AlertTriangle size={16} className="text-red-500" />}
                <p className={`font-semibold text-sm ${done.inTime ? 'text-green-800' : 'text-red-800'}`}>
                  {done.weekly ? `Filed for every ${WEEKDAY_NAMES[done.weekday]}` : done.inTime ? 'Filed in time' : 'Filed, but late'}
                </p>
              </div>
              <p className={`text-xs ${done.inTime ? 'text-green-700' : 'text-red-700'}`}>
                {done.weekly
                  ? `It applies to every ${WEEKDAY_NAMES[done.weekday]} meeting from now on and counts as told in time. Remove it below if it stops being true.`
                  : done.inTime
                  ? `Your leads will see this before ${prettyDay(done.date)}.`
                  : done.outAll
                    ? `This is under ${NOTICE_HOURS} hours before the meeting, so it counts absent. Your leads will still see the reason.`
                    : `This is under ${NOTICE_HOURS} hours before the meeting, so the time you miss won't be excused. Your leads will still see the reason.`}
              </p>
              <button onClick={() => setDone(null)}
                className="mt-3 text-xs font-semibold text-gray-600 hover:text-gray-800 underline">
                File another
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={outAll}
                    onChange={(e) => setOutAll(e.target.checked)}
                    className="accent-brand-blue-dark" />
                  <span className="text-sm text-gray-700">I won't be there at all</span>
                </label>
              </div>

              {!outAll && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">I'll arrive at</label>
                    <input type="time" value={arriveAt} step="300"
                      onChange={(e) => setArriveAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">and leave at</label>
                    <input type="time" value={leaveAt} step="300"
                      onChange={(e) => setLeaveAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
                  </div>
                </div>
              )}

              {/* What those two times mean for attendance, worked out as they
                  type — the minutes are what gets recorded, and nobody should
                  have to do that arithmetic in their head. */}
              {!outAll && window_ && (
                <div className={`rounded-lg px-3 py-2 text-xs ${
                  window_.backwards ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-600'}`}>
                  {window_.backwards ? (
                    "That's leaving before you arrive — check the times."
                  ) : window_.late === 0 && window_.early === 0 ? (
                    <>That's the whole meeting ({pretty(hhmm(meeting.start))} – {pretty(hhmm(meeting.end))}), so there's nothing to report.</>
                  ) : (
                    <>
                      There for <b>{Math.floor(window_.there / 60)}h {window_.there % 60}m</b> of{' '}
                      {Math.floor(meeting.mins / 60)}h — <b>{window_.pct}%</b> of the meeting.
                      {window_.late > 0 && <> {window_.late} min late.</>}
                      {window_.early > 0 && <> Leaving {window_.early} min early.</>}
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Which day?</label>
                <input type="date" value={date} min={weekly ? undefined : localDay()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
              </div>

              {/* A fixed commitment — gymnastics, a lesson, a shift — is the
                  same every week. Filing it once beats filing it every week
                  and forgetting the one that counts. */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={weekly}
                  onChange={(e) => setWeekly(e.target.checked)}
                  className="accent-brand-blue-dark mt-0.5" />
                <span className="text-sm text-gray-700">
                  Every {dayName}, from now on
                  <span className="block text-xs text-gray-400">
                    A regular thing like a lesson or practice. Filed once, it applies to
                    every {dayName} meeting until you remove it.
                  </span>
                </span>
              </label>

              {/* The number is the whole point, so it leads — how far ahead
                  this notice is, against the day they picked. Seeing it before
                  they submit is what stops a late one being a surprise. */}
              <div className={`rounded-lg px-3 py-2.5 flex items-start gap-2.5 ${
                weekly ? 'bg-brand-blue/20 text-gray-700'
                  : past ? 'bg-gray-100 text-gray-500'
                  : inTime ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {weekly ? <Repeat size={15} className="shrink-0 mt-0.5" /> : <Clock size={15} className="shrink-0 mt-0.5" />}
                {weekly ? (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">Every {dayName}</p>
                    <p className="text-xs opacity-80 mt-0.5">
                      Applies to each {dayName} meeting from now on, and always counts as told in time.
                      A notice for one particular day still wins over it.
                    </p>
                  </div>
                ) : past ? (
                  <span className="text-xs">That day has already started.</span>
                ) : (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">
                      {Math.floor(hoursAhead)} hours before {prettyDay(date)}
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">
                      {inTime
                        ? `That's over ${NOTICE_HOURS} hours, so it counts.`
                        : outAll
                          ? `That's under ${NOTICE_HOURS} hours, so this would count absent.`
                          : `That's under ${NOTICE_HOURS} hours, so the time missed won't be excused.`}
                    </p>
                    <p className="text-[11px] opacity-60 mt-0.5">
                      Measured from {target.time}
                      {target.assumed ? ', the usual start — that day isn\'t on the calendar' : ', off the calendar'}.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Why?</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                  placeholder="Doctor's appointment, family thing, away game…"
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button onClick={submit}
                disabled={saving || (!weekly && past) || !date || !reason.trim() || (!outAll && (!arriveAt || !leaveAt))}
                className="w-full py-2.5 rounded-xl bg-brand-blue hover:bg-brand-blue-dark disabled:opacity-40 text-sm font-semibold transition-colors">
                {saving ? 'Sending…' : weekly ? `File for every ${dayName}` : past ? 'That day has passed' : "Let them know"}
              </button>
            </div>
          )}

          {(mine.length > 0 || standing.length > 0) && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-semibold text-gray-700 text-sm">What you've filed</h2>
                {/* Same as the logs: the bin lives behind the pencil rather
                    than sitting on every row. */}
                {(mine.some(canRemove) || standing.length > 0) && (
                  <button
                    onClick={() => setEditingMine(v => !v)}
                    title={editingMine ? 'Done' : 'Remove one you filed by mistake'}
                    className={`p-1 rounded-lg transition-colors ${
                      editingMine ? 'bg-brand-yellow text-gray-800' : 'text-gray-400 hover:bg-brand-blue/30'
                    }`}
                  >
                    {editingMine ? <CheckIcon size={14} /> : <Pencil size={14} />}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {standing.map(s => (
                  <div key={s.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-semibold bg-brand-blue/40 text-gray-700">
                      weekly
                    </span>
                    <div className="min-w-0">
                      <p className="text-gray-700 font-medium">Every {WEEKDAY_NAMES[s.weekday]}</p>
                      <p className="text-gray-500">
                        {s.kind === 'partial'
                          ? `${pretty(s.arrive_at)} – ${pretty(s.leave_at)}`
                          : 'out for the meeting'}
                      </p>
                      <p className="text-gray-400 break-words">{s.reason}</p>
                    </div>
                    {editingMine && (
                      <button
                        onClick={() => removeStanding(s)}
                        title="Remove this standing notice"
                        className="ml-auto shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {mine.map(n => (
                  <div key={n.id} className="flex items-start gap-2 text-xs">
                    <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-semibold ${
                      n.on_time ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {n.on_time ? 'in time' : 'late'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-gray-700 font-medium">
                        {new Date(n.meeting_date + 'T00:00:00').toLocaleDateString('en-US',
                          { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-gray-500">
                        {n.kind === 'partial'
                          ? `${pretty(n.arrive_at)} – ${pretty(n.leave_at)}`
                            + (n.late_min ? ` · ${n.late_min} min late` : '')
                            + (n.early_min ? ` · left ${n.early_min} min early` : '')
                          : 'out for the meeting'}
                      </p>
                      <p className="text-gray-400 break-words">{n.reason}</p>
                    </div>
                    {editingMine && canRemove(n) && (
                      <button
                        onClick={() => removeMine(n)}
                        title="Remove this notice"
                        className="ml-auto shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
    </Shell>
  )
}

// A page when it's opened on its own, a plain block when it sits in a tab.
function Shell({ embedded, onBack, children }) {
  if (embedded) return <div className="space-y-4">{children}</div>
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        <div className="max-w-lg mx-auto space-y-4">
          <button onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft size={14} /> Back
          </button>
          {children}
        </div>
      </div>
    </div>
  )
}
