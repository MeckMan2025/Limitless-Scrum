import { useState, useEffect } from 'react'
import { teamScope } from '../lib/teamScope'
import { usePermissions } from '../hooks/usePermissions'
import { lazyHeadersWith } from '../lib/restHeaders'
import { ThumbsUp } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'

// The "?" panel in the bell: ideas pitched from under-construction pages (and
// the suggestions box generally). EVERYONE can see them and thumbs-up the ones
// they want; co-founders also get a mark-reviewed action. Votes live in the
// scouting_schedule doc 'idea_votes' ({ suggestionId: [usernames] }) — same
// no-migration pattern as the other shared docs.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

const fmt = (ts) => ts ? new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''

export function useIdeasPanel(canReview) {
  const { username } = useUser()
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [items, setItems] = useState([])
  const [votes, setVotes] = useState({})

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [sRes, vRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/suggestions?${SCOPE}&status=eq.pending&order=created_at.desc&limit=20&select=id,author,text,created_at`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/scouting_schedule?${SCOPE}&id=eq.idea_votes&select=data`, { headers }),
        ])
        if (!active) return
        if (sRes.ok) setItems(await sRes.json())
        if (vRes.ok) {
          const rows = await vRes.json()
          setVotes(rows?.[0]?.data || {})
        }
      } catch { /* ignore */ }
    }
    load()
    const ch = supabase
      .channel('ideas-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, (p) => {
        if (p.new?.id === 'idea_votes' && p.new?.data) setVotes(p.new.data)
      })
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [])

  const toggleVote = (id) => {
    const cur = votes[id] || []
    const mine = cur.includes(username)
    const next = { ...votes, [id]: mine ? cur.filter(n => n !== username) : [...cur, username] }
    setVotes(next)
    fetch(`${supabaseUrl}/rest/v1/scouting_schedule`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
      body: JSON.stringify({ id: 'idea_votes', data: next }),
    }).catch(() => {})
  }

  const dismiss = (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
    fetch(`${supabaseUrl}/rest/v1/suggestions?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'reviewed' }),
    }).catch(() => {})
  }

  const panel = items.length === 0 ? (
    <div className="p-6 text-center text-sm text-gray-400">No ideas waiting</div>
  ) : (
    <div className="divide-y divide-gray-100">
      {items.map(i => {
        const v = votes[i.id] || []
        const mine = v.includes(username)
        return (
          <div key={i.id} className="p-3">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{i.text}</p>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-gray-400">{i.author} · {fmt(i.created_at)}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleVote(i.id)}
                  title={mine ? 'Remove thumbs up' : 'Thumbs up'}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full transition-colors ${
                    mine ? 'bg-brand-blue text-gray-800' : 'bg-gray-100 text-gray-400 hover:bg-brand-blue/40'
                  }`}
                >
                  <ThumbsUp size={11} /> {v.length || ''}
                </button>
                {canReview && (
                  <button onClick={() => dismiss(i.id)} className="text-[10px] font-semibold text-gray-300 hover:text-gray-500">
                    mark reviewed
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  return { ideaCount: items.length, panel }
}
