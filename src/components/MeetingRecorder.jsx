import { useState, useEffect } from 'react'
import { teamScope, storedTeamScope } from '../lib/teamScope'
import { usePermissions } from '../hooks/usePermissions'
import { lazyHeadersWith } from '../lib/restHeaders'
import { Play, Square, Trash2 } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'

// PM meeting recorder. Start takes a snapshot of the team's state (task ids +
// statuses, robot blocked list, software bugs/tasks); Stop takes another and
// DIFFS them — so "3 tasks completed, 2 purchases, 1 bug fixed" is computed
// from what actually changed, not from anyone remembering to log it.
// Sessions live in scouting_schedule doc 'meeting_log' (active + history).

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

const DOC_ID = 'meeting_log'
const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const getDoc = async (id) => {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.${id}&select=data`, { headers })
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.data || null
  } catch { return null }
}

const getRows = async (path) => {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    return res.ok ? await res.json() : []
  } catch { return [] }
}

// What the team's world looks like right now, in diffable form.
async function takeSnapshot() {
  const [tasks, robot, software] = await Promise.all([
    getRows('tasks?select=id,status'),
    getDoc('robot_status'),
    getDoc('software_status'),
  ])
  return {
    tasks: Object.fromEntries((tasks || []).map(t => [t.id, t.status])),
    blockedIds: (robot?.blocked || []).map(b => b.id),
    bugIds: (software?.bugs || []).map(b => b.id),
    swTasks: Object.fromEntries((software?.tasks || []).map(t => [t.id, !!t.done])),
  }
}

const DONE = (st) => st === 'done' || st === 'completed'

// Local calendar date, to line a meeting up with its attendance session.
const localDay = (ms) => {
  const d = new Date(ms), pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function computeStats(startAt, snapshot) {
  const now = Date.now()
  const end = await takeSnapshot()
  const s = snapshot || { tasks: {}, blockedIds: [], bugIds: [], swTasks: {} }

  const tasksCreated = Object.keys(end.tasks).filter(id => !(id in s.tasks)).length
  const tasksCompleted = Object.entries(end.tasks).filter(([id, st]) => DONE(st) && id in s.tasks && !DONE(s.tasks[id])).length
  const blockedAdded = end.blockedIds.filter(id => !s.blockedIds.includes(id)).length
  const blockedResolved = s.blockedIds.filter(id => !end.blockedIds.includes(id)).length
  const bugsAdded = end.bugIds.filter(id => !s.bugIds.includes(id)).length
  const bugsFixed = s.bugIds.filter(id => !end.bugIds.includes(id)).length
  const swTasksDone = Object.entries(end.swTasks).filter(([id, done]) => done && id in s.swTasks && !s.swTasks[id]).length
  // Tasks that changed column without finishing — the ones already counted as
  // completed aren't counted twice here.
  const tasksMoved = Object.entries(end.tasks).filter(([id, st]) =>
    id in s.tasks && st !== s.tasks[id] && !(DONE(st) && !DONE(s.tasks[id]))
  ).length

  // How much of the team was actually here, from the attendance session for
  // this meeting's day.
  let presentCount = 0, markedCount = 0, attendancePct = null
  const sessions = await getRows(`attendance_sessions?select=id&session_date=eq.${localDay(startAt)}`)
  if (sessions.length > 0) {
    const recs = await getRows(`attendance_records?select=status&session_id=eq.${sessions[0].id}`)
    presentCount = recs.filter(r => r.status === 'present').length
    markedCount = recs.length
    attendancePct = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : null
  }

  // Time-windowed sources (these carry real timestamps).
  const [ledgerDoc, requests, notebook] = await Promise.all([
    getDoc('finance_ledger'),
    getRows(`requests?select=type,status,created_at,reviewed_at&created_at=gte.${new Date(startAt).toISOString()}`),
    getRows(`notebook_entries?select=id&created_at=gte.${new Date(startAt).toISOString()}`),
  ])
  const txns = (ledgerDoc?.transactions || []).filter(t => (t.at || 0) >= startAt && (t.at || 0) <= now)
  const purchases = txns.filter(t => t.kind === 'expense')
  const spent = purchases.reduce((a, t) => a + (Number(t.amount) || 0), 0)
  const raised = txns.filter(t => t.kind === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0)

  return {
    durationMin: Math.max(1, Math.round((now - startAt) / 60000)),
    tasksCreated, tasksCompleted, tasksMoved,
    attendancePct, presentCount, markedCount,
    purchases: purchases.length, spent, raised,
    requestsMade: (requests || []).length,
    notebookEntries: (notebook || []).length,
    blockedAdded, blockedResolved, bugsAdded, bugsFixed, swTasksDone,
  }
}

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

export function StatChips({ stats }) {
  const chips = [
    stats.tasksCompleted > 0 && `✅ ${stats.tasksCompleted} task${stats.tasksCompleted === 1 ? '' : 's'} completed`,
    stats.tasksCreated > 0 && `📝 ${stats.tasksCreated} task${stats.tasksCreated === 1 ? '' : 's'} made`,
    stats.tasksMoved > 0 && `🔀 ${stats.tasksMoved} task${stats.tasksMoved === 1 ? '' : 's'} moved`,
    typeof stats.attendancePct === 'number' && `👥 ${stats.attendancePct}% here (${stats.presentCount}/${stats.markedCount})`,
    stats.swTasksDone > 0 && `💻 ${stats.swTasksDone} code task${stats.swTasksDone === 1 ? '' : 's'} done`,
    stats.purchases > 0 && `🛒 ${stats.purchases} purchase${stats.purchases === 1 ? '' : 's'} (${money(stats.spent)})`,
    stats.raised > 0 && `📈 ${money(stats.raised)} raised`,
    stats.requestsMade > 0 && `📥 ${stats.requestsMade} request${stats.requestsMade === 1 ? '' : 's'} made`,
    stats.notebookEntries > 0 && `📓 ${stats.notebookEntries} notebook entr${stats.notebookEntries === 1 ? 'y' : 'ies'}`,
    stats.blockedResolved > 0 && `🔓 ${stats.blockedResolved} blocker${stats.blockedResolved === 1 ? '' : 's'} resolved`,
    stats.blockedAdded > 0 && `🔴 ${stats.blockedAdded} new blocker${stats.blockedAdded === 1 ? '' : 's'}`,
    stats.bugsFixed > 0 && `🐛 ${stats.bugsFixed} bug${stats.bugsFixed === 1 ? '' : 's'} fixed`,
    stats.bugsAdded > 0 && `🐞 ${stats.bugsAdded} bug${stats.bugsAdded === 1 ? '' : 's'} found`,
  ].filter(Boolean)
  if (chips.length === 0) return <p className="text-xs italic text-gray-300">Nothing recorded changed</p>
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(c => (
        <span key={c} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c}</span>
      ))}
    </div>
  )
}

export default function MeetingRecorder() {
  const { username } = useUser()
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [doc, setDoc] = useState(null) // { active, history }
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const d = await getDoc(DOC_ID)
    setDoc(d || { active: null, history: [] })
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('meeting-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === DOC_ID && p.new?.data) setDoc(p.new.data)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const persist = async (next) => {
    setDoc(next)
    await fetch(`${supabaseUrl}/rest/v1/scouting_schedule`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
      body: JSON.stringify({ id: DOC_ID, data: next }),
    }).catch(() => {})
  }

  const start = async () => {
    setBusy(true)
    const snapshot = await takeSnapshot()
    await persist({ ...(doc || {}), history: doc?.history || [], active: { startAt: Date.now(), startedBy: username, snapshot } })
    setBusy(false)
  }

  const stop = async () => {
    if (!doc?.active) return
    setBusy(true)
    const stats = await computeStats(doc.active.startAt, doc.active.snapshot)
    const session = {
      id: uid(),
      startAt: doc.active.startAt,
      endAt: Date.now(),
      startedBy: doc.active.startedBy,
      stoppedBy: username,
      stats,
    }
    await persist({ active: null, history: [session, ...(doc.history || [])].slice(0, 30) })
    setBusy(false)
  }

  if (!doc) return <p className="text-sm text-gray-400 animate-pulse">Loading…</p>

  const active = doc.active
  const fmt = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="space-y-3">
      {/* Start / live banner */}
      {active ? (
        <div className="rounded-xl border-2 border-red-200 bg-red-50/50 p-3.5 flex items-center gap-3">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-700">Meeting in progress</p>
            <p className="text-xs text-gray-500">Started {fmt(active.startAt)} by {active.startedBy}</p>
          </div>
          <button
            onClick={stop}
            disabled={busy}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white transition-colors"
          >
            <Square size={14} /> {busy ? 'Wrapping up…' : 'Stop Meeting'}
          </button>
        </div>
      ) : (
        <button
          onClick={start}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-brand-blue/50 hover:bg-brand-blue disabled:opacity-50 text-gray-700 transition-colors"
        >
          <Play size={15} /> {busy ? 'Taking snapshot…' : 'Start Meeting'}
        </button>
      )}

    </div>
  )
}

// Full meeting history — the only place past meetings live (Special Controls ->
// Meeting Stats). Leads can delete a recorded meeting from here.
export function MeetingStatsView({ onBack }) {
  const [doc, setDoc] = useState(null)
  useEffect(() => { getDoc(DOC_ID).then(d => setDoc(d || { history: [] })) }, [])
  const fmt = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  const remove = async (id) => {
    if (!confirm('Delete this meeting record?')) return
    const next = { ...(doc || {}), history: (doc?.history || []).filter(m => m.id !== id) }
    setDoc(next)
    await fetch(`${supabaseUrl}/rest/v1/scouting_schedule`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
      body: JSON.stringify({ id: DOC_ID, data: next }),
    }).catch(() => {})
  }
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-md mx-auto space-y-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <h2 className="text-lg font-bold text-gray-700">🎙️ Meeting Stats</h2>
        {!doc ? (
          <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
        ) : (doc.history || []).length === 0 ? (
          <p className="text-sm text-gray-400">No meetings recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {(doc.history || []).map(m => (
              <div key={m.id} className="group bg-white rounded-xl border border-gray-100 p-3.5">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-[11px] text-gray-400">
                    {fmt(m.startAt)} · {m.stats?.durationMin ?? '?'} min · started by {m.startedBy}
                  </p>
                  <button
                    onClick={() => remove(m.id)}
                    title="Delete this meeting record"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-red-50 shrink-0 transition-opacity"
                  >
                    <Trash2 size={13} className="text-gray-300 hover:text-red-400" />
                  </button>
                </div>
                {m.stats && <StatChips stats={m.stats} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
