import { useState } from 'react'
import { Plus, X, AlertTriangle } from 'lucide-react'
import AddInline from './AddInline'
import { useRobotStatus } from '../hooks/useRobotStatus'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../contexts/UserContext'

// The shared hardware dashboard — one robot, one board, seen by CAD,
// Assembly/Building, and Wiring alike. The headline status is DERIVED from the
// subsystem statuses, so the big banner can't disagree with the details.

const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// Status cycle a subsystem clicks through, in build order.
const STATUSES = ['todo', 'building', 'testing', 'redesign', 'ready']
const STATUS_META = {
  todo:     { label: 'Not Started',    chip: 'bg-gray-100 text-gray-500' },
  building: { label: 'Building',       chip: 'bg-blue-100 text-blue-700' },
  testing:  { label: 'Testing',        chip: 'bg-amber-100 text-amber-700' },
  redesign: { label: 'Needs Redesign', chip: 'bg-red-100 text-red-600' },
  ready:    { label: 'Ready',          chip: 'bg-green-100 text-green-700' },
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

export default function RobotDashboard({ editable = false, publicOnly = false }) {
  const { robot, loading, update } = useRobotStatus()
  const { hasLeadTag } = usePermissions()
  const { username } = useUser()
  const [newSub, setNewSub] = useState('')
  const [addingSub, setAddingSub] = useState(false)

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading robot status…</p>

  const subs = robot.subsystems || []
  const blocked = robot.blocked || []
  const ready = subs.filter(s => s.status === 'ready').length
  const pct = subs.length ? Math.round((ready / subs.length) * 100) : 0

  // Headline derives from the parts: redesign/blocked drags it red, testing
  // holds it amber, all-ready goes green.
  const hero = blocked.length > 0 || subs.some(s => s.status === 'redesign')
    ? { emoji: '🔴', text: 'Needs Attention', cls: 'text-red-500' }
    : subs.length > 0 && subs.every(s => s.status === 'ready')
    ? { emoji: '🟢', text: 'Competition Ready', cls: 'text-green-600' }
    : subs.some(s => s.status === 'testing')
    ? { emoji: '🟡', text: 'Testing', cls: 'text-amber-600' }
    : { emoji: '🔵', text: 'Building', cls: 'text-blue-600' }

  const dl = robot.deadline || {}
  const dlCount = countdown(dl.date)

  const cycle = (id) => update({
    subsystems: subs.map(s => s.id === id
      ? { ...s, status: STATUSES[(STATUSES.indexOf(s.status) + 1) % STATUSES.length] }
      : s),
  })

  const addSub = () => {
    if (!newSub.trim()) return
    update({ subsystems: [...subs, { id: uid(), name: newSub.trim(), emoji: '🔩', status: 'todo' }] })
    setNewSub(''); setAddingSub(false)
  }
  const removeSub = (id) => update({ subsystems: subs.filter(s => s.id !== id) })

  const addBlocked = (text) => text.trim() &&
    update({ blocked: [...blocked, { id: uid(), text: text.trim(), by: username, at: Date.now() }] })
  const resolveBlocked = (id) => update({ blocked: blocked.filter(b => b.id !== id) })

  return (
    <div className="space-y-3">
      {/* Hero: derived robot status + readiness bar + deadline */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 flex items-center gap-4">
        <span className="text-4xl">🤖</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xl font-black leading-tight ${hero.cls}`}>{hero.emoji} {hero.text}</p>
          <p className="text-xs text-gray-400 mt-0.5">{ready}/{subs.length} subsystems ready{blocked.length > 0 ? ` · ${blocked.length} blocked` : ''}</p>
          <div className="mt-1.5 h-2 rounded-full bg-brand-blue/40 overflow-hidden">
            <div className="h-full rounded-full bg-brand-blue-dark transition-all" style={{ width: `${pct}%` }} />
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

      {/* Current build priority */}
      <div className="rounded-xl bg-white border border-gray-100 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-1">🎯 Current Build Priority</p>
        {editable ? (
          <input
            defaultValue={robot.priority}
            onBlur={e => update({ priority: e.target.value })}
            placeholder="What the team is building right now…"
            className="w-full text-lg font-semibold text-gray-800 bg-transparent focus:outline-none focus:border-b focus:border-brand-blue"
          />
        ) : (
          <p className="text-lg font-semibold text-gray-800">{robot.priority || <span className="italic text-gray-300 text-sm font-normal">Not set</span>}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Subsystem status — click a chip to advance it */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-gray-700">🔩 Subsystems</h4>
            {editable && (
              <button onClick={() => setAddingSub(a => !a)} className="p-1 rounded hover:bg-gray-100" title="Add subsystem">
                <Plus size={14} className="text-gray-400" />
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {subs.map(s => {
              const meta = STATUS_META[s.status] || STATUS_META.todo
              return (
                <div key={s.id} className="flex items-center gap-2 group">
                  <span className="text-base shrink-0">{s.emoji}</span>
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{s.name}</span>
                  <button
                    onClick={editable ? () => cycle(s.id) : undefined}
                    disabled={!editable}
                    title={editable ? 'Click to advance status' : meta.label}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${meta.chip} ${editable ? 'hover:opacity-75' : ''}`}
                  >
                    {meta.label}
                  </button>
                  {hasLeadTag && editable && (
                    <button onClick={() => removeSub(s.id)} className="opacity-0 group-hover:opacity-100 p-0.5" title="Remove (leads)">
                      <X size={12} className="text-gray-300 hover:text-red-400" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {addingSub && editable && (
            <div className="mt-2 flex gap-1.5">
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSub()} placeholder="Subsystem name" autoFocus className="flex-1 min-w-0 text-sm border border-gray-100 rounded-lg px-2 py-1" />
              <button onClick={addSub} className="shrink-0 px-3 text-sm font-semibold bg-brand-blue/40 hover:bg-brand-blue rounded-lg">Add</button>
            </div>
          )}
        </div>

        {/* Blocked items */}
        {!publicOnly && (
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-red-400" /> Blocked
              {blocked.length > 0 && <span className="text-xs font-normal text-gray-400">({blocked.length})</span>}
            </h4>
            {blocked.length === 0 && <p className="text-xs italic text-gray-300">Nothing blocked 🎉</p>}
            <div className="space-y-1">
              {blocked.map(b => (
                <div key={b.id} className="flex items-center gap-2 group">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">{b.text}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{b.by}</span>
                  {editable && (
                    <button onClick={() => resolveBlocked(b.id)} className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-green-600 hover:underline shrink-0" title="Resolved">
                      resolve
                    </button>
                  )}
                </div>
              ))}
            </div>
            {editable && <AddInline label="Add blocked item" placeholder="What's stuck" onAdd={addBlocked} />}
          </div>
        )}
      </div>
    </div>
  )
}
