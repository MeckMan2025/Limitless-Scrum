import { useState } from 'react'
import { Plus, X, Bug } from 'lucide-react'
import AddInline from './AddInline'
import { useSoftwareStatus } from '../hooks/useSoftwareStatus'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../contexts/UserContext'

// Software dashboard for the Programming role — the software twin of the
// hardware Robot Status board. The headline derives from system statuses and
// open bugs, so it can't disagree with the details below it.

const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const SYS_STATUSES = ['todo', 'coding', 'testing', 'broken', 'ready']
const SYS_META = {
  todo:    { label: 'Not Started', chip: 'bg-gray-100 text-gray-500' },
  coding:  { label: 'Coding',      chip: 'bg-blue-100 text-blue-700' },
  testing: { label: 'Testing',     chip: 'bg-amber-100 text-amber-700' },
  broken:  { label: 'Broken',      chip: 'bg-red-100 text-red-600' },
  ready:   { label: 'Ready',       chip: 'bg-green-100 text-green-700' },
}

const READY_STATUSES = ['todo', 'coding', 'testing', 'reliable']
const READY_META = {
  todo:     { label: 'Not Started', chip: 'bg-gray-100 text-gray-500' },
  coding:   { label: 'Coding',      chip: 'bg-blue-100 text-blue-700' },
  testing:  { label: 'Testing',     chip: 'bg-amber-100 text-amber-700' },
  reliable: { label: 'Reliable',    chip: 'bg-green-100 text-green-700' },
}

const countdown = (dateKey) => {
  const [y, m, d] = (dateKey || '').split('-').map(Number)
  if (!y || !m || !d) return null
  const now = new Date()
  const days = Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
  if (days === 0) return { label: 'TODAY', cls: 'bg-red-100 text-red-600' }
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, cls: 'bg-red-100 text-red-600' }
  if (days <= 7) return { label: `in ${days}d`, cls: 'bg-amber-100 text-amber-700' }
  return { label: `in ${days}d`, cls: 'bg-blue-100 text-blue-700' }
}

export default function SoftwareDashboard({ editable = false, publicOnly = false }) {
  const { software, loading, update } = useSoftwareStatus()
  const { hasLeadTag } = usePermissions()
  const { username } = useUser()
  const [newSys, setNewSys] = useState('')
  const [addingSys, setAddingSys] = useState(false)

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading software status…</p>

  const systems = software.systems || []
  const bugs = software.bugs || []
  const tasks = software.tasks || []
  const openTasks = tasks.filter(t => !t.done)
  const readyCount = systems.filter(s => s.status === 'ready').length
  const pct = systems.length ? Math.round((readyCount / systems.length) * 100) : 0

  const hero = bugs.length > 0 || systems.some(s => s.status === 'broken')
    ? { emoji: '🔴', text: 'Needs Fixes', cls: 'text-red-500' }
    : systems.length > 0 && systems.every(s => s.status === 'ready')
    ? { emoji: '🟢', text: 'Stable', cls: 'text-green-600' }
    : systems.some(s => s.status === 'testing')
    ? { emoji: '🟡', text: 'Testing', cls: 'text-amber-600' }
    : { emoji: '🔵', text: 'In Development', cls: 'text-blue-600' }

  const dl = software.deadline || {}
  const dlCount = countdown(dl.date)

  const cycleSys = (id) => update({
    systems: systems.map(s => s.id === id
      ? { ...s, status: SYS_STATUSES[(SYS_STATUSES.indexOf(s.status) + 1) % SYS_STATUSES.length] }
      : s),
  })
  const cycleReady = (key) => update({
    [key]: READY_STATUSES[(READY_STATUSES.indexOf(software[key]) + 1) % READY_STATUSES.length],
  })

  const addSys = () => {
    if (!newSys.trim()) return
    update({ systems: [...systems, { id: uid(), name: newSys.trim(), emoji: '💻', status: 'todo' }] })
    setNewSys(''); setAddingSys(false)
  }
  const removeSys = (id) => update({ systems: systems.filter(s => s.id !== id) })

  const addBug = (text) => text.trim() && update({ bugs: [...bugs, { id: uid(), text: text.trim(), by: username, at: Date.now() }] })
  const fixBug = (id) => update({ bugs: bugs.filter(b => b.id !== id) })
  const addTask = (text) => text.trim() && update({ tasks: [...tasks, { id: uid(), text: text.trim(), by: username, at: Date.now(), done: false }] })
  const toggleTask = (id) => update({ tasks: tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) })
  const removeTask = (id) => update({ tasks: tasks.filter(t => t.id !== id) })

  const ReadyChip = ({ label, k }) => {
    const meta = READY_META[software[k]] || READY_META.todo
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{label}</span>
        <button
          onClick={editable ? () => cycleReady(k) : undefined}
          disabled={!editable}
          title={editable ? 'Click to advance' : meta.label}
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.chip} ${editable ? 'hover:opacity-75' : ''}`}
        >
          {meta.label}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Hero: derived software status + readiness + deadline */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 flex items-center gap-4">
        <span className="text-4xl">💻</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xl font-black leading-tight ${hero.cls}`}>{hero.emoji} {hero.text}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {readyCount}/{systems.length} systems ready · {openTasks.length} open task{openTasks.length === 1 ? '' : 's'} · {bugs.length} bug{bugs.length === 1 ? '' : 's'}
          </p>
          <div className="mt-1.5 h-2 rounded-full bg-brand-yellow/40 overflow-hidden">
            <div className="h-full rounded-full bg-brand-yellow-dark transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">⏰ Next Deadline</p>
          {editable ? (
            <div className="mt-0.5 space-y-1">
              <input
                defaultValue={dl.label}
                onBlur={e => update({ deadline: { ...dl, label: e.target.value } })}
                placeholder="What's due"
                className="w-32 text-xs text-right border border-gray-100 rounded-lg px-1.5 py-0.5"
              />
              <input
                type="date"
                value={dl.date || ''}
                onChange={e => update({ deadline: { ...dl, date: e.target.value } })}
                className="w-32 text-xs border border-gray-100 rounded-lg px-1.5 py-0.5"
              />
            </div>
          ) : (
            <p className="text-sm font-semibold text-gray-700 mt-0.5">{dl.label || '—'}</p>
          )}
          {dlCount && <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${dlCount.cls}`}>{dlCount.label}</span>}
        </div>
      </div>

      {/* Autonomous / TeleOp readiness */}
      <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ReadyChip label="🤖 Autonomous" k="auto" />
        <ReadyChip label="🕹️ TeleOp" k="teleop" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* System status */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-gray-700">🖥️ System Status</h4>
            {editable && (
              <button onClick={() => setAddingSys(a => !a)} className="p-1 rounded hover:bg-gray-100" title="Add system">
                <Plus size={14} className="text-gray-400" />
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {systems.map(s => {
              const meta = SYS_META[s.status] || SYS_META.todo
              return (
                <div key={s.id} className="flex items-center gap-2 group">
                  <span className="text-base shrink-0">{s.emoji}</span>
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{s.name}</span>
                  <button
                    onClick={editable ? () => cycleSys(s.id) : undefined}
                    disabled={!editable}
                    title={editable ? 'Click to advance status' : meta.label}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${meta.chip} ${editable ? 'hover:opacity-75' : ''}`}
                  >
                    {meta.label}
                  </button>
                  {hasLeadTag && editable && (
                    <button onClick={() => removeSys(s.id)} className="opacity-0 group-hover:opacity-100 p-0.5" title="Remove (leads)">
                      <X size={12} className="text-gray-300 hover:text-red-400" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {addingSys && editable && (
            <div className="mt-2 flex gap-1.5">
              <input value={newSys} onChange={e => setNewSys(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSys()} placeholder="System name" autoFocus className="flex-1 min-w-0 text-sm border border-gray-100 rounded-lg px-2 py-1" />
              <button onClick={addSys} className="shrink-0 px-3 text-sm font-semibold bg-brand-yellow/40 hover:bg-brand-yellow rounded-lg">Add</button>
            </div>
          )}
        </div>

        {/* Bugs */}
        {!publicOnly && (
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <Bug size={14} className="text-red-400" /> Known Bugs
              {bugs.length > 0 && <span className="text-xs font-normal text-gray-400">({bugs.length})</span>}
            </h4>
            {bugs.length === 0 && <p className="text-xs italic text-gray-300">No known bugs 🎉</p>}
            <div className="space-y-1">
              {bugs.map(b => (
                <div key={b.id} className="flex items-center gap-2 group">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">{b.text}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{b.by}</span>
                  {editable && (
                    <button onClick={() => fixBug(b.id)} className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-green-600 hover:underline shrink-0" title="Fixed">
                      fixed
                    </button>
                  )}
                </div>
              ))}
            </div>
            {editable && <AddInline label="Report bug" placeholder="What's broken" onAdd={addBug} />}
          </div>
        )}

        {/* Open tasks */}
        {!publicOnly && (
          <div className="bg-white rounded-xl border border-gray-100 p-3.5 lg:col-span-2">
            <h4 className="text-sm font-bold text-gray-700 mb-2">📋 Programming Tasks {openTasks.length > 0 && <span className="text-xs font-normal text-gray-400">({openTasks.length} open)</span>}</h4>
            {tasks.length === 0 && <p className="text-xs italic text-gray-300">Nothing on the list</p>}
            <div className="space-y-1">
              {tasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={!!t.done} disabled={!editable} onChange={() => toggleTask(t.id)} className="accent-brand-yellow-dark shrink-0" />
                  <span className={`text-sm flex-1 ${t.done ? 'line-through text-gray-300' : 'text-gray-600'}`}>{t.text}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{t.by}</span>
                  {editable && (
                    <button onClick={() => removeTask(t.id)} className="opacity-0 group-hover:opacity-100 p-0.5"><X size={12} className="text-gray-300 hover:text-red-400" /></button>
                  )}
                </div>
              ))}
            </div>
            {editable && <AddInline label="Add task" placeholder="What needs doing" onAdd={addTask} />}
          </div>
        )}
      </div>
    </div>
  )
}
