import { useState, useEffect } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { lazyRestHeaders } from '../lib/restHeaders'
import { X, Clock } from 'lucide-react'
import { supabase } from '../supabase'
import { StatChips } from './MeetingRecorder'

// When a PM stops a meeting, everyone sees the recap ONCE — live if they have
// the app open, otherwise the next time they open it (within 12h). Live-only
// turned out to be fragile: it depended on a realtime event landing, so anyone
// not looking at the app simply never saw the meeting's stats.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyRestHeaders

const SEEN_KEY = 'meeting-recap-seen'

export default function MeetingRecapPopup() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    const consider = (doc) => {
      const latest = doc?.history?.[0]
      if (!latest) return
      if (localStorage.getItem(SEEN_KEY) === latest.id) return
      // Still recent enough to be worth showing; the seen-key keeps it to once.
      if (Date.now() - (latest.endAt || 0) > 12 * 60 * 60 * 1000) return
      setSession(latest)
    }
    // Catch up on a meeting that ended while the app was closed…
    ;(async () => {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/scouting_schedule?${storedTeamScope()}&id=eq.meeting_log&select=data`, { headers })
        if (res.ok) {
          const rows = await res.json()
          consider(rows?.[0]?.data)
        }
      } catch { /* ignore */ }
    })()
    // …and pop immediately for one that ends while it's open.
    const ch = supabase
      .channel('meeting-recap')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === 'meeting_log' && p.new?.data) consider(p.new.data)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  if (!session) return null

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, session.id)
    setSession(null)
  }

  const fmt = (ts) => new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={dismiss} />
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto animate-bounce-in overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2 bg-brand-blue/30">
            <span className="text-lg">🎙️</span>
            <span className="text-sm font-semibold text-gray-700">Meeting Recap</span>
            <button onClick={dismiss} className="p-1 rounded hover:bg-white/50 transition-colors ml-auto">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
              <Clock size={12} /> {fmt(session.startAt)} · {session.stats?.durationMin ?? '?'} min · run by {session.startedBy}
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-2">Here's what the team got done:</p>
            <StatChips stats={session.stats || {}} />
          </div>
          <div className="px-5 pb-5">
            <button
              onClick={dismiss}
              className="w-full py-2.5 rounded-xl font-semibold text-gray-700 bg-brand-blue hover:bg-brand-blue-dark hover:text-white transition-colors"
            >
              Nice 👏
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
