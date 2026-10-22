import { useState, useEffect } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { lazyRestHeaders } from '../lib/restHeaders'
import { assigneeLabel } from '../lib/taskTeams'
import { createPortal } from 'react-dom'
import { Users, AlertTriangle, X, Plus, Clock } from 'lucide-react'
import { supabase } from '../supabase'

// Small lead-only button: who's carrying fewer than three tasks. Kept as a
// button rather than a list so the dashboard stays quiet — names only appear
// in the popup, and a warning badge shows when someone is under-loaded.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyRestHeaders

const TARGET = 3
const DONE = (s) => s === 'done' || s === 'completed'

export default function TaskLoadButton() {
  const [under, setUnder] = useState([]) // [{ name, count }]
  const [dueSoon, setDueSoon] = useState([]) // [{ title, assignee, due, overdue }]
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('load') // 'load' | 'due'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=display_name,function_tags,authority_tier`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/tasks?select=id,title,assignee,status,due_date`, { headers }),
        ])
        if (!active || !pRes.ok || !tRes.ok) return
        const profiles = await pRes.json()
        const tasks = await tRes.json()

        // Count only open tasks; a finished task isn't current workload.
        const counts = {}
        for (const t of tasks) {
          const who = (t.assignee || '').trim()
          if (!who || who === '__up_for_grabs__' || DONE(t.status)) continue
          counts[who.toLowerCase()] = (counts[who.toLowerCase()] || 0) + 1
        }

        // Real people only. Excluding authority_tier 'guest' would drop most of
        // the team — that's the default tier for a fresh account until roles are
        // assigned — so only actual team accounts and explicit Guests are cut.
        // Students only: adults (mentors/coaches) don't carry a task quota, and
        // team/guest/test accounts aren't people.
        const NOT_STUDENTS = ['Mentor', 'Coach', 'Team', 'Guest']
        const people = (profiles || []).filter(p => {
          const tags = p.function_tags || []
          if (NOT_STUDENTS.some(t => tags.includes(t))) return false
          // ETS is a testing account, not a teammate.
          return (p.display_name || '').trim().toLowerCase() !== 'ets'
        })

        // Anything already overdue or landing within a week — a lead wants to
        // see that alongside who's under-loaded.
        const today = new Date()
        const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const weekOut = new Date(midnight.getTime() + 7 * 86400000)
        const soon = []
        for (const t of tasks) {
          if (DONE(t.status)) continue
          const [y, m, d] = String(t.due_date || '').split('-').map(Number)
          if (!y || !m || !d) continue
          const due = new Date(y, m - 1, d)
          if (due > weekOut) continue
          soon.push({
            id: t.id,
            title: t.title,
            assignee: assigneeLabel(t.assignee),
            due,
            overdue: due < midnight,
          })
        }
        soon.sort((a, b) => a.due - b.due)
        setDueSoon(soon)

        setUnder(
          people
            .map(p => ({ name: p.display_name, count: counts[(p.display_name || '').toLowerCase()] || 0 }))
            .filter(p => p.count < TARGET)
            .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name))
        )
      } catch { /* ignore */ }
    }
    load()
    const ch = supabase
      .channel('task-load-button')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [])

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
        <button
          onClick={() => { setView('load'); setOpen(true) }}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
          title="Who has fewer than 3 tasks"
        >
          <Users size={12} className="text-gray-400" />
          Task load
          {under.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle size={9} /> {under.length}
            </span>
          )}
        </button>

        {/* Its own button so it can't be missed as a badge. */}
        {dueSoon.length > 0 && (
          <button
            onClick={() => { setView('due'); setOpen(true) }}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
              dueSoon.some(t => t.overdue)
                ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
            }`}
            title="Tasks due within a week"
          >
            <Clock size={12} />
            {dueSoon.some(t => t.overdue) ? 'Overdue' : 'Due soon'}
            <span className="text-[10px] font-bold">{dueSoon.length}</span>
          </button>
        )}
      </div>

      {open && createPortal(
        <>
          <div className="fixed inset-0 bg-black/40 z-[95]" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-[96] flex items-center justify-center pointer-events-none p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs pointer-events-auto overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 flex-1">
                  {view === 'due' ? 'Due within a week' : `Fewer than ${TARGET} tasks`}
                  <span className="ml-1.5 font-normal text-gray-400">
                    ({view === 'due' ? dueSoon.length : under.length})
                  </span>
                </h3>
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100">
                  <X size={15} className="text-gray-500" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                {view === 'due' ? null : under.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-400">Everyone has {TARGET} or more 🎉</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {under.map(p => (
                      <button
                        key={p.name}
                        onClick={() => {
                          setOpen(false)
                          // NotificationBell-style event: this button renders in
                          // many places, so ask App to navigate rather than
                          // threading a callback down.
                          window.dispatchEvent(new CustomEvent('view-person-tasks', { detail: p.name }))
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
                      >
                        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1 truncate">{p.name}</span>
                        <span className="text-xs font-semibold text-gray-400">
                          {p.count} task{p.count === 1 ? '' : 's'}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(false)
                            window.dispatchEvent(new CustomEvent('assign-task-to', { detail: p.name }))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault(); e.stopPropagation()
                              setOpen(false)
                              window.dispatchEvent(new CustomEvent('assign-task-to', { detail: p.name }))
                            }
                          }}
                          title={`Assign a task to ${p.name}`}
                          className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-1 rounded-lg bg-brand-blue/40 hover:bg-brand-blue text-gray-700 transition-colors cursor-pointer"
                        >
                          <Plus size={10} /> Assign
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {dueSoon.length > 0 && view === 'due' && (
                  <div>
                    <div className="divide-y divide-gray-100">
                      {dueSoon.map(t => (
                        <div key={t.id} className="px-4 py-2 flex items-center gap-2">
                          <Clock size={12} className={t.overdue ? 'text-red-500 shrink-0' : 'text-blue-400 shrink-0'} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-700 truncate">{t.title}</p>
                            <p className="text-[10px] text-gray-400 truncate">{t.assignee}</p>
                          </div>
                          <span className={`text-[10px] font-semibold shrink-0 ${t.overdue ? 'text-red-600' : 'text-gray-400'}`}>
                            {t.overdue ? 'overdue' : t.due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
