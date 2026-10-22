import { useState, useEffect } from 'react'
import { Info, X, ChevronDown } from 'lucide-react'

// The (i) on a scouting form: what every question means, one section at a
// time, opened on the section the scout is looking at. A popup rather than a
// page, so the half-filled form is still there underneath.
//
// fields: the form's field list (each has key, label, group, hint, options)
// help: { [key]: { enter, means } }   notes: { [group]: sentence }

export function HelpButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="What each question means"
      aria-label="What each question means"
      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-brand-blue/20 hover:text-gray-700 transition-colors"
    >
      <Info size={16} />
    </button>
  )
}

export default function ScoutingHelp({ title, fields, help, notes = {}, currentGroup, onClose }) {
  const groups = []
  fields.forEach(f => {
    let g = groups.find(x => x.name === f.group)
    if (!g) { g = { name: f.group, fields: [] }; groups.push(g) }
    g.fields.push(f)
  })
  const [open, setOpen] = useState(() => new Set([currentGroup].filter(Boolean)))
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const toggle = (name) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const enterFor = (f) => help[f.key]?.enter
    || (f.options?.length ? f.options.join(' / ') : f.type === 'number' ? 'Count' : f.type === 'scale' ? `${f.min} to ${f.max}` : 'Text')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-xl max-h-[88vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`${title} — what each question means`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800 truncate">{title}: what each question means</h2>
            <p className="text-[11px] text-gray-400">Tap a section to open it</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-2 divide-y divide-gray-100">
          {groups.map(g => {
            const isOpen = open.has(g.name)
            const here = g.name === currentGroup
            return (
              <div key={g.name} className="py-1">
                <button
                  type="button"
                  onClick={() => toggle(g.name)}
                  className="w-full flex items-center justify-between gap-2 py-2 text-left"
                >
                  <span className="text-sm font-semibold text-gray-800">
                    {g.name}{here && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-brand-gold-dark">you are here</span>}
                  </span>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="pb-3 space-y-3">
                    {notes[g.name] && <p className="text-xs text-gray-500">{notes[g.name]}</p>}
                    {g.fields.map(f => (
                      <div key={f.key} className="rounded-xl bg-gray-50 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-700">{f.label}</span>
                          <span className="text-[11px] text-gray-400 text-right shrink-0">{enterFor(f)}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{help[f.key]?.means || f.hint || ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
