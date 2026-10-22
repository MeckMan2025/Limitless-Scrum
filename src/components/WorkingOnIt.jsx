import { useState } from 'react'
import { stampStored } from '../lib/teamScope'
import { ideaReviewerIds } from '../lib/cofounders'
import { lazyHeadersWith } from '../lib/restHeaders'
import { Lightbulb, Send } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { useUser } from '../contexts/UserContext'
import { triggerPush } from '../utils/pushHelper'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

// The standard "not built yet" screen — the one AI Manual has always used.
// Any tab that needs a placeholder renders this so they all stay identical.
// Visitors can pitch what THEY want the page to be — ideas land in the
// suggestions box and ping the co-founders' 💡 panel in the bell.
export default function WorkingOnIt({ title }) {
  const { username, user } = useUser()
  const [idea, setIdea] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async () => {
    const text = idea.trim()
    if (!text) return
    setIdea(''); setSent(true)
    setTimeout(() => setSent(false), 4000)
    try {
      await fetch(`${supabaseUrl}/rest/v1/suggestions`, {
        method: 'POST', headers,
        // Stamped with the team, so the reviewers can see where it came from.
        body: JSON.stringify(stampStored({
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          author: username || 'Anonymous',
          author_id: user?.id || null,
          text: `[${title}] ${text}`,
          status: 'pending',
        })),
      })
      // Ping Kayden and Yukti so ideas don't sit unseen — from every team.
      {
        for (const id of await ideaReviewerIds(supabaseUrl, headers)) {
          const notif = {
            id: String(Date.now()) + Math.random().toString(36).slice(2) + id.slice(0, 4),
            user_id: id,
            type: 'idea',
            title: `💡 Idea for ${title}`,
            body: `${username}: ${text}`,
          }
          await fetch(`${supabaseUrl}/rest/v1/notifications`, { method: 'POST', headers, body: JSON.stringify(notif) })
          triggerPush(notif)
        }
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              {title}
            </h1>
          </div>
          <NotificationBell />
        </div>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-7xl mb-5 animate-bounce">🚧</div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-700 mb-2">Under Construction</h2>
        <p className="text-gray-500 max-w-sm">
          <span className="font-semibold text-brand-blue-dark">Kayden</span> and{' '}
          <span className="font-semibold text-brand-yellow-dark">Yukti</span> are working on it 🛠️
        </p>

        {/* Pitch what this page should be */}
        <div className="mt-8 w-full max-w-sm">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-600 mb-2">
            <Lightbulb size={15} className="text-brand-silver-dark" /> Have an idea for this page?
          </p>
          {sent ? (
            <p className="text-sm text-green-600 font-medium py-2">Sent to the co-founders 💌</p>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={idea}
                onChange={e => setIdea(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="What should this page do?"
                className="flex-1 min-w-0 text-sm border rounded-xl px-3 py-2 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              />
              <button
                onClick={submit}
                disabled={!idea.trim()}
                className="shrink-0 flex items-center gap-1 px-3 py-2 bg-brand-silver/60 hover:bg-brand-silver disabled:opacity-40 rounded-xl text-sm font-semibold text-gray-700 transition-colors"
              >
                <Send size={13} /> Send
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
