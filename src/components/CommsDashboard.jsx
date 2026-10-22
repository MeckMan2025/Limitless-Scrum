import { useState, useEffect } from 'react'
import { teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { Plus, X, Check, Send } from 'lucide-react'
import AddInline from './AddInline'
import { useCommsBoard } from '../hooks/useCommsBoard'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../contexts/UserContext'

// Communications role dashboard: what still needs communicating, which calendar
// events need promo (pulled from the real calendar, not retyped), drafts
// awaiting a lead's sign-off, and what recently went out.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const prettyDate = (key) => {
  const [y, m, d] = (key || '').split('-').map(Number)
  return (y && m && d)
    ? new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
}

const prettyStamp = (at) =>
  at ? new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

const STATUS_CHIP = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-600',
}

export default function CommsDashboard({ editable = false, publicOnly = false }) {
  const { board, loading, update } = useCommsBoard()
  const { hasLeadTag, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const { username } = useUser()

  const [events, setEvents] = useState([])
  const [drafting, setDrafting] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')

  // Upcoming calendar events (next 30 days) — the promo worklist.
  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const until = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
        const res = await fetch(
          `${supabaseUrl}/rest/v1/calendar_events?${SCOPE}&date_key=gte.${today}&date_key=lte.${until}&order=date_key.asc&limit=8&select=id,name,date_key,category,event_type`,
          { headers: restHeaders() }
        )
        if (res.ok) setEvents(await res.json())
      } catch { /* ignore */ }
    })()
  }, [])

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading…</p>

  const queue = board.queue || []
  const drafts = board.drafts || []
  const published = board.published || []
  const promoted = board.promoted || []
  const openQueue = queue.filter(q => !q.done)

  const addQueue = (text) => text.trim() &&
    update({ queue: [...queue, { id: uid(), text: text.trim(), by: username, at: Date.now(), done: false }] })
  const toggleQueue = (id) => update({ queue: queue.map(q => q.id === id ? { ...q, done: !q.done } : q) })
  const removeQueue = (id) => update({ queue: queue.filter(q => q.id !== id) })

  const togglePromoted = (id) =>
    update({ promoted: promoted.includes(id) ? promoted.filter(p => p !== id) : [...promoted, id] })

  const addDraft = () => {
    if (!draftTitle.trim()) return
    update({ drafts: [...drafts, { id: uid(), title: draftTitle.trim(), text: draftText.trim(), by: username, at: Date.now(), status: 'pending' }] })
    setDraftTitle(''); setDraftText(''); setDrafting(false)
  }
  const reviewDraft = (id, status) =>
    update({ drafts: drafts.map(d => d.id === id ? { ...d, status, reviewed_by: username } : d) })
  const removeDraft = (id) => update({ drafts: drafts.filter(d => d.id !== id) })
  const markSent = (d) => update({
    drafts: drafts.filter(x => x.id !== d.id),
    published: [...published, { id: d.id, text: d.title, by: username, at: Date.now() }],
  })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* To communicate */}
        {!publicOnly && (
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <h4 className="text-sm font-bold text-gray-700 mb-2">📣 Still To Communicate {openQueue.length > 0 && <span className="text-xs font-normal text-gray-400">({openQueue.length})</span>}</h4>
            {queue.length === 0 && <p className="text-xs italic text-gray-300">All caught up</p>}
            <div className="space-y-1">
              {queue.map(q => (
                <div key={q.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={!!q.done} disabled={!editable} onChange={() => toggleQueue(q.id)} className="accent-brand-silver-dark shrink-0" />
                  <span className={`text-sm flex-1 ${q.done ? 'line-through text-gray-300' : 'text-gray-600'}`}>{q.text}</span>
                  {editable && (
                    <button onClick={() => removeQueue(q.id)} className="opacity-0 group-hover:opacity-100 p-0.5"><X size={12} className="text-gray-300 hover:text-red-400" /></button>
                  )}
                </div>
              ))}
            </div>
            {editable && <AddInline label="Add announcement need" placeholder="What needs announcing" onAdd={addQueue} />}
          </div>
        )}

        {/* Events to promote — pulled from the calendar */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <h4 className="text-sm font-bold text-gray-700 mb-2">📅 Events To Promote</h4>
          {events.length === 0 ? (
            <p className="text-xs italic text-gray-300">No upcoming events on the calendar</p>
          ) : (
            <div className="space-y-1">
              {events.map(ev => (
                <div key={ev.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={promoted.includes(ev.id)}
                    disabled={!editable}
                    onChange={() => togglePromoted(ev.id)}
                    title="Promoted"
                    className="accent-brand-silver-dark shrink-0"
                  />
                  <span className={`text-sm flex-1 truncate ${promoted.includes(ev.id) ? 'line-through text-gray-300' : 'text-gray-600'}`}>{ev.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{prettyDate(ev.date_key)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drafts for approval */}
        {!publicOnly && (
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-700">✍️ Drafts For Approval</h4>
              {editable && (
                <button onClick={() => setDrafting(d => !d)} className="p-1 rounded hover:bg-gray-100" title="New draft">
                  <Plus size={14} className="text-gray-400" />
                </button>
              )}
            </div>
            {drafting && editable && (
              <div className="mb-2 space-y-1.5">
                <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="What's it for (e.g. Instagram — kickoff recap)" autoFocus className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1" />
                <textarea value={draftText} onChange={e => setDraftText(e.target.value)} rows={2} placeholder="Draft text (optional)" className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1 resize-none" />
                <button onClick={addDraft} disabled={!draftTitle.trim()} className="w-full text-sm font-semibold bg-brand-silver/40 hover:bg-brand-silver disabled:opacity-50 rounded-lg py-1">Submit for approval</button>
              </div>
            )}
            {drafts.length === 0 && !drafting && <p className="text-xs italic text-gray-300">No drafts waiting</p>}
            <div className="space-y-2">
              {drafts.map(d => (
                <div key={d.id} className="group">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_CHIP[d.status] || STATUS_CHIP.pending}`}>
                          {d.status === 'pending' ? 'Awaiting approval' : d.status === 'approved' ? `Approved by ${d.reviewed_by}` : `Denied by ${d.reviewed_by}`}
                        </span>
                        <span className="text-[10px] text-gray-400">{d.by}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mt-0.5">{d.title}</p>
                      {d.text && <p className="text-xs text-gray-500 line-clamp-2">{d.text}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasLeadTag && d.status === 'pending' && (
                        <>
                          <button onClick={() => reviewDraft(d.id, 'approved')} title="Approve" className="p-1 rounded hover:bg-green-50"><Check size={14} className="text-green-500" /></button>
                          <button onClick={() => reviewDraft(d.id, 'denied')} title="Deny" className="p-1 rounded hover:bg-red-50"><X size={14} className="text-red-400" /></button>
                        </>
                      )}
                      {editable && d.status === 'approved' && (
                        <button onClick={() => markSent(d)} title="Mark as published / sent" className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-brand-silver/40 hover:bg-brand-silver text-gray-700">
                          <Send size={11} /> Sent
                        </button>
                      )}
                      {editable && d.status === 'denied' && (
                        <button onClick={() => removeDraft(d.id)} className="opacity-0 group-hover:opacity-100 p-0.5" title="Discard"><X size={12} className="text-gray-300 hover:text-red-400" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently published */}
        <div className="bg-white rounded-xl border border-gray-100 p-3.5">
          <h4 className="text-sm font-bold text-gray-700 mb-2">📤 Recently Published</h4>
          {published.length === 0 ? (
            <p className="text-xs italic text-gray-300">Nothing sent yet</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {[...published].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8).map(p => (
                <div key={p.id} className="py-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12 shrink-0">{prettyStamp(p.at)}</span>
                  <span className="text-sm text-gray-600 flex-1 truncate">{p.text}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{p.by}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
