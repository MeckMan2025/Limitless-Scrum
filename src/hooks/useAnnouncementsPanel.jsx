import { useState, useEffect } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { lazyRestHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'

// The announcements list shown inside the notification bell's panel — same
// pattern as useRequestsPanel: returns a count for the badge and the rendered
// list for the panel body. Announcements lost their nav tab a while back, so
// the bell is where they live now.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyRestHeaders

const fmt = (ts) => ts ? new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''

export function useAnnouncementsPanel() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/announcements?${storedTeamScope()}&select=id,title,body,author_name,created_at&order=created_at.desc&limit=15`, { headers })
        if (res.ok && active) setItems(await res.json())
      } catch { /* ignore */ }
    }
    load()
    const ch = supabase
      .channel('announcements-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [])

  // "New" = posted in the last 3 days; that drives the badge.
  const fresh = items.filter(a => Date.now() - new Date(a.created_at).getTime() < 3 * 86400000).length

  const panel = items.length === 0 ? (
    <div className="p-6 text-center text-sm text-gray-400">No announcements</div>
  ) : (
    <div className="divide-y divide-gray-100">
      {items.map(a => (
        <div key={a.id} className="p-3">
          <p className="text-sm font-medium text-gray-700">{a.title}</p>
          {a.body && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{a.body}</p>}
          <p className="text-[10px] text-gray-400 mt-1">{a.author_name || ''} · {fmt(a.created_at)}</p>
        </div>
      ))}
    </div>
  )

  return { freshCount: fresh, panel }
}
