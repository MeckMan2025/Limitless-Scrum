import { useState } from 'react'
import { lazyRestHeaders } from '../lib/restHeaders'
import { Megaphone, BarChart3, Check, X } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { useToast } from './ToastProvider'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyRestHeaders

function AnnouncementPopup({ announcement, onDismiss }) {
  const { username, user } = useUser()
  const { addToast } = useToast()
  const [voted, setVoted] = useState(null)
  const [voting, setVoting] = useState(false)

  if (!announcement) return null

  const isPoll = announcement.type === 'poll'
  const options = announcement.poll_options || []

  const handleVote = async (choice) => {
    if (voting || voted) return
    setVoting(true)

    const vote = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      announcement_id: announcement.id,
      user_id: user?.id,
      user_name: username,
      choice,
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/announcement_votes`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(vote),
    })

    if (res.ok) {
      setVoted(choice)
    } else {
      addToast('Failed to vote.', 'error')
    }
    setVoting(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={onDismiss} />
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto animate-bounce-in overflow-hidden">
          {/* Header bar */}
          <div className={`px-4 py-3 flex items-center gap-2 ${isPoll ? 'bg-brand-blue/30' : 'bg-brand-yellow/30'}`}>
            {isPoll
              ? <BarChart3 size={20} className="text-brand-blue-dark" />
              : <Megaphone size={20} className="text-brand-yellow-dark" />
            }
            <span className="text-sm font-semibold text-gray-700">
              {isPoll ? 'New Poll' : 'New Announcement'}
            </span>
            <span className="text-xs text-gray-500 ml-auto">from {announcement.author_name}</span>
            <button onClick={onDismiss} className="p-1 rounded hover:bg-white/50 transition-colors ml-1">
              <X size={16} className="text-gray-500" />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <h2 className="text-lg font-bold text-gray-800">{announcement.title}</h2>

            {!isPoll && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{announcement.body}</p>
            )}

            {isPoll && (
              <div className="space-y-2">
                {options.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleVote(option)}
                    disabled={voting || !!voted}
                    className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors text-sm font-medium ${
                      voted === option
                        ? 'border-brand-blue bg-brand-blue/20 text-gray-800'
                        : voted
                          ? 'border-gray-200 text-gray-400'
                          : 'border-gray-200 hover:border-brand-blue hover:bg-brand-blue/10 text-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {voted === option && <Check size={14} className="text-brand-blue-dark" />}
                      {option}
                    </span>
                  </button>
                ))}
                {voted && <p className="text-xs text-gray-400 text-center">Vote recorded! View full results in Announcements tab.</p>}
              </div>
            )}

            <button
              onClick={onDismiss}
              className={`w-full py-2.5 rounded-xl font-semibold text-gray-700 transition-colors ${
                isPoll ? 'bg-brand-blue hover:bg-brand-blue-dark' : 'bg-brand-yellow hover:bg-brand-yellow-dark'
              }`}
            >
              {isPoll && !voted ? 'Skip' : 'Got it'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default AnnouncementPopup
