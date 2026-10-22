import { useState, useEffect } from 'react'
import { X, ChevronDown, Eye, EyeOff } from 'lucide-react'
import AddInline from './AddInline'
import { SIDE_THEME, sideForRole } from '../data/roleTrackers'

// Trackers are laid out by FORM, not in one flat grid: headline numbers become a
// tight row of stat tiles, ratios become meters, and only the trackers that carry
// body content (checklist / note / event) get a full card. Giving every tracker
// equal weight is what made this feel overwhelming.

// 1284 -> 1,284 · 12900 -> 12.9K · 4200000 -> 4.2M
const compact = (n) => {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 10_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return v.toLocaleString()
}

const withUnit = (val, unit) =>
  unit === '$' ? `$${val}` : unit ? `${val} ${unit}` : `${val}`

// ── Admin affordances: visibility toggle + delete ──
// Icon-only and faint, so six trackers don't add up to a wall of pills and
// buttons. Fades in on hover/focus of the parent card.
// No delete control: trackers are shared team data, and one stray click would
// wipe a tracker for everyone. Visibility is the only thing togglable here.
function Chrome({ tracker, onChange }) {
  const isPublic = tracker.visibility === 'public'
  const Icon = isPublic ? Eye : EyeOff
  return (
    <div className="flex items-center gap-0.5 shrink-0 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        onClick={() => onChange({ ...tracker, visibility: isPublic ? 'role' : 'public' })}
        title={isPublic ? 'Public — everyone sees this in RoleSpec. Click to make role-only.' : 'Role-only — just your dashboard. Click to make public.'}
        className="p-1 rounded hover:bg-gray-100"
      >
        <Icon size={12} className="text-gray-400" />
      </button>
    </div>
  )
}

// ── Stat tile — the form for a headline number ──
// Proportional figures on purpose: tabular-nums makes a value like 121 look loose
// at display size. Reserve that for columns of numbers.
function StatTile({ tracker, editable, onChange, theme }) {
  const [draft, setDraft] = useState(tracker.value)
  useEffect(() => { setDraft(tracker.value) }, [tracker.value])

  return (
    <div className={`group rounded-xl px-3 py-2.5 ${theme.tile}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 leading-tight">
          {tracker.icon && <span className="mr-1 not-italic">{tracker.icon}</span>}
          {tracker.name}
        </p>
        {editable && <Chrome tracker={tracker} onChange={onChange} />}
      </div>
      {editable ? (
        <div className="flex items-baseline gap-1 mt-1">
          {tracker.unit === '$' && <span className="text-xl font-semibold text-gray-400">$</span>}
          <input
            type="number"
            value={draft}
            onChange={e => setDraft(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={() => onChange({ ...tracker, value: Number(draft) || 0 })}
            className="w-full min-w-0 text-[26px] leading-none font-semibold text-gray-800 bg-transparent focus:outline-none"
          />
          {tracker.unit && tracker.unit !== '$' && <span className="text-xs text-gray-400 shrink-0">{tracker.unit}</span>}
        </div>
      ) : (
        <p className="text-[26px] leading-none font-semibold text-gray-800 mt-1">
          {withUnit(compact(tracker.value), tracker.unit)}
        </p>
      )}
    </div>
  )
}

// ── Meter — a single ratio against a limit ──
function Meter({ tracker, editable, onChange, theme }) {
  const [draft, setDraft] = useState(tracker.value)
  useEffect(() => { setDraft(tracker.value) }, [tracker.value])

  const target = tracker.target || 100
  const val = Number(tracker.value) || 0
  const pct = Math.max(0, Math.min(100, Math.round((val / target) * 100)))

  return (
    <div className="group bg-white rounded-xl border border-gray-100 px-3 py-2.5">
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 leading-tight">
          {tracker.icon && <span className="mr-1">{tracker.icon}</span>}
          {tracker.name}
        </p>
        {editable && <Chrome tracker={tracker} onChange={onChange} />}
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-lg font-semibold text-gray-800">
          {withUnit(compact(val), tracker.unit)}
          <span className="text-xs font-normal text-gray-400"> / {withUnit(compact(target), tracker.unit)}</span>
        </span>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
      {/* Track is a lighter step of the bar's own hue, not gray. */}
      <div className={`h-2 rounded-full overflow-hidden ${theme.track}`}>
        <div className={`h-full rounded-full ${theme.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {editable && (
        <input
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={() => onChange({ ...tracker, value: Number(draft) || 0 })}
          placeholder="Update"
          className="mt-2 w-full text-sm border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
        />
      )}
    </div>
  )
}

// ── Content card — checklist / note / event ──
function ContentCard({ tracker, editable, onChange }) {
  const [draft, setDraft] = useState(tracker.value)
  useEffect(() => { setDraft(tracker.value) }, [tracker.value])

  const commit = (val) => onChange({ ...tracker, value: val })

  return (
    <div className="group bg-white rounded-xl border border-gray-100 p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-bold text-gray-700 leading-tight">
          {tracker.icon && <span className="mr-1">{tracker.icon}</span>}
          {tracker.name}
        </h4>
        {editable && <Chrome tracker={tracker} onChange={onChange} />}
      </div>

      {/* CHECKLIST */}
      {tracker.type === 'checklist' && (() => {
        const items = Array.isArray(tracker.value) ? tracker.value : []
        const done = items.filter(i => i.done).length
        const toggle = (i) => commit(items.map((it, idx) => idx === i ? { ...it, done: !it.done } : it))
        const removeItem = (i) => commit(items.filter((_, idx) => idx !== i))
        const addItem = (text) => text.trim() && commit([...items, { text: text.trim(), done: false }])
        return (
          <div>
            {items.length > 0 && <p className="text-[11px] text-gray-400 mb-1.5">{done}/{items.length} done</p>}
            <div className="space-y-1">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 group/item">
                  <input type="checkbox" checked={!!it.done} disabled={!editable} onChange={() => toggle(i)} className="accent-brand-yellow-dark shrink-0" />
                  <span className={`text-sm flex-1 ${it.done ? 'line-through text-gray-300' : 'text-gray-600'}`}>{it.text}</span>
                  {editable && (
                    <button onClick={() => removeItem(i)} className="opacity-0 group-hover/item:opacity-100 p-0.5"><X size={12} className="text-gray-300 hover:text-red-400" /></button>
                  )}
                </div>
              ))}
              {items.length === 0 && <p className="text-xs italic text-gray-300">Nothing yet</p>}
            </div>
            {editable && <AddInline label="Add item" onAdd={addItem} />}
          </div>
        )
      })()}

      {/* NOTE */}
      {tracker.type === 'note' && (
        editable ? (
          <textarea
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            placeholder="Write an update…"
            className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
          />
        ) : (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{tracker.value || <span className="italic text-gray-300">No update yet</span>}</p>
        )
      )}

      {/* EVENT */}
      {tracker.type === 'event' && (() => {
        const ev = (draft && typeof draft === 'object' && !Array.isArray(draft)) ? draft : {}
        const set = (k, v) => setDraft({ ...ev, [k]: v })
        const commitEvent = () => commit(ev)
        // Date is a discrete pick, so save it right away instead of waiting for blur.
        const setDate = (v) => { const next = { ...ev, date: v }; setDraft(next); commit(next) }

        // Parse the date-only string by hand so the local timezone can't shift the day.
        const parsed = (() => {
          const [y, m, d] = (ev.date || '').split('-').map(Number)
          return (y && m && d) ? new Date(y, m - 1, d) : null
        })()

        const countdown = (() => {
          if (!parsed) return null
          const now = new Date()
          const days = Math.round((parsed - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
          if (days === 0) return { label: 'Today', cls: 'bg-green-100 text-green-700' }
          if (days === 1) return { label: 'Tomorrow', cls: 'bg-green-100 text-green-700' }
          if (days < 0) return { label: `${Math.abs(days)}d ago`, cls: 'bg-gray-100 text-gray-500' }
          return { label: `in ${days}d`, cls: 'bg-orange-100 text-orange-700' }
        })()

        const pretty = parsed
          ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : ''

        if (editable) {
          return (
            <div className="space-y-1.5">
              <input
                value={ev.title || ''}
                onChange={e => set('title', e.target.value)}
                onBlur={commitEvent}
                placeholder="Event name"
                className="w-full text-sm font-semibold border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              />
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={ev.date || ''}
                  onChange={e => setDate(e.target.value)}
                  className="flex-1 min-w-0 text-sm border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                />
                {countdown && (
                  <span className={`shrink-0 self-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${countdown.cls}`}>
                    {countdown.label}
                  </span>
                )}
              </div>
              <input
                value={ev.location || ''}
                onChange={e => set('location', e.target.value)}
                onBlur={commitEvent}
                placeholder="Location"
                className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              />
              <textarea
                rows={2}
                value={ev.details || ''}
                onChange={e => set('details', e.target.value)}
                onBlur={commitEvent}
                placeholder="Details — who's going, what to bring…"
                className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1 focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
              />
            </div>
          )
        }

        if (!ev.title && !ev.date) return <p className="text-sm italic text-gray-300">Nothing scheduled</p>
        return (
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-gray-800 leading-tight">{ev.title || 'Untitled event'}</p>
              {countdown && (
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${countdown.cls}`}>
                  {countdown.label}
                </span>
              )}
            </div>
            {pretty && <p className="text-xs text-gray-500 mt-0.5">{pretty}</p>}
            {ev.location && <p className="text-xs text-gray-400">{ev.location}</p>}
            {ev.details && <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1.5">{ev.details}</p>}
          </div>
        )
      })()}
    </div>
  )
}

// ── A role's dashboard section ──
export default function RoleDashboard({ role, trackers, upsertTracker, removeTracker, editable = false, publicOnly = false, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const theme = SIDE_THEME[sideForRole(role)]

  let list = trackers.filter(t => t.role === role)
  if (publicOnly) list = list.filter(t => t.visibility === 'public')

  // Split by form so each tier gets the weight it deserves.
  const stats = list.filter(t => t.type === 'number')
  const meters = list.filter(t => t.type === 'progress')
  const content = list.filter(t => t.type === 'checklist' || t.type === 'note' || t.type === 'event')

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={collapsible ? () => setOpen(o => !o) : undefined}
          className={`flex items-center gap-2 shrink-0 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {collapsible && <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />}
          <span className={`w-1 h-4 rounded-full ${theme.dot}`} />
          <h3 className={`text-xs font-bold uppercase tracking-[0.12em] ${theme.text}`}>{role}</h3>
        </button>
        {/* Hairline rule carries the eye across — reads as a section header, not a card title. */}
        <div className={`flex-1 h-px ${theme.rule}`} />
      </div>

      {open && (
        <>
          {list.length === 0 ? (
            <p className="text-sm text-gray-400 mb-2">{publicOnly ? 'No public trackers yet.' : 'No trackers yet.'}</p>
          ) : (
            <div className="space-y-3">
              {/* Headline numbers — a tight KPI row, denser than the cards below */}
              {stats.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {stats.map(t => (
                    <StatTile key={t.id} tracker={t} editable={editable} theme={theme} onChange={upsertTracker} />
                  ))}
                </div>
              )}

              {meters.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {meters.map(t => (
                    <Meter key={t.id} tracker={t} editable={editable} theme={theme} onChange={upsertTracker} />
                  ))}
                </div>
              )}

              {content.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {content.map(t => (
                    <ContentCard key={t.id} tracker={t} editable={editable} onChange={upsertTracker} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
