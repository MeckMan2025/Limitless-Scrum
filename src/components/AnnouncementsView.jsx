import { useState, useEffect } from 'react'
import { onlyMyTeam, teamScope } from '../lib/teamScope'
import { usePermissions } from '../hooks/usePermissions'
import { lazyRestHeaders } from '../lib/restHeaders'
import { Megaphone, BarChart3, Check } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { useToast } from './ToastProvider'
import NotificationBell from './NotificationBell'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const fetchHeaders = lazyRestHeaders

function AnnouncementsView() {
  const { username, user } = useUser()
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const { addToast } = useToast()
  const [announcements, setAnnouncements] = useState([])
  const [votes, setVotes] = useState([])
  const [voting, setVoting] = useState(null) // announcement id currently being voted on

  // Load announcements
  useEffect(() => {
    async function load() {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/announcements?${SCOPE}&select=*&order=created_at.desc`,
        { headers: fetchHeaders }
      )
      if (res.ok) setAnnouncements(await res.json())
    }
    if (username) load()
  }, [username])

  // Load all votes
  useEffect(() => {
    async function load() {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/announcement_votes?${SCOPE}&select=*`,
        { headers: fetchHeaders }
      )
      if (res.ok) setVotes(await res.json())
    }
    if (username) load()
  }, [username])

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('announcements-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, onlyMyTeam((payload) => {
        setAnnouncements(prev => {
          if (prev.some(a => a.id === payload.new.id)) return prev
          return [payload.new, ...prev]
        })
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'announcements' }, onlyMyTeam((payload) => {
        setAnnouncements(prev => prev.filter(a => a.id !== payload.old.id))
      }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcement_votes' }, onlyMyTeam((payload) => {
        setVotes(prev => {
          if (prev.some(v => v.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'announcement_votes' }, onlyMyTeam((payload) => {
        setVotes(prev => prev.map(v => v.id === payload.new.id ? payload.new : v))
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleVote = async (announcementId, choice) => {
    if (voting) return
    setVoting(announcementId)

    const existingVote = votes.find(v => v.announcement_id === announcementId && v.user_id === user?.id)

    if (existingVote) {
      // Update existing vote
      const res = await fetch(
        `${supabaseUrl}/rest/v1/announcement_votes?id=eq.${existingVote.id}`,
        {
          method: 'PATCH',
          headers: { ...fetchHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ choice }),
        }
      )
      if (res.ok) {
        setVotes(prev => prev.map(v => v.id === existingVote.id ? { ...v, choice } : v))
      } else {
        addToast('Failed to update vote.', 'error')
      }
    } else {
      // Insert new vote
      const vote = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        announcement_id: announcementId,
        user_id: user?.id,
        user_name: username,
        choice,
      }

      // Optimistic update
      setVotes(prev => [...prev, vote])

      const res = await fetch(`${supabaseUrl}/rest/v1/announcement_votes`, {
        method: 'POST',
        headers: { ...fetchHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(vote),
      })

      if (!res.ok) {
        // Rollback
        setVotes(prev => prev.filter(v => v.id !== vote.id))
        addToast('Failed to vote.', 'error')
      }
    }

    setVoting(null)
  }

  const getVotesForAnnouncement = (announcementId) => {
    return votes.filter(v => v.announcement_id === announcementId)
  }

  const getUserVote = (announcementId) => {
    return votes.find(v => v.announcement_id === announcementId && v.user_id === user?.id)
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="py-4 px-4 flex items-center text-gray-200">
          <div className="w-10 shrink-0 text-gray-200" />
          <div className="flex-1 text-center">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Announcements
            </h1>
            <p className="text-sm text-gray-300">Team announcements and polls</p>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          {announcements.length === 0 && (
            <div className="text-center py-12">
              <Megaphone size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No announcements yet</p>
            </div>
          )}

          {announcements.map((a) => {
            const isPoll = a.type === 'poll'
            const userVote = getUserVote(a.id)
            const announcementVotes = getVotesForAnnouncement(a.id)
            const totalVotes = announcementVotes.length
            const options = a.poll_options || []

            return (
              <div key={a.id} className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${isPoll ? 'bg-brand-blue/30' : 'bg-brand-yellow/30'}`}>
                    {isPoll ? <BarChart3 size={20} className="text-brand-blue-dark" /> : <Megaphone size={20} className="text-brand-yellow-dark" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {isPoll ? 'Poll' : 'Message'}
                      </span>
                      <span className="text-xs text-gray-400">{formatTime(a.created_at)}</span>
                    </div>
                    <h3 className="font-semibold text-gray-800">{a.title}</h3>

                    {!isPoll && (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.body}</p>
                    )}

                    {isPoll && (
                      <div className="mt-3 space-y-2">
                        {options.map((option) => {
                          const optionVotes = announcementVotes.filter(v => v.choice === option).length
                          const pct = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0
                          const isSelected = userVote?.choice === option

                          return (
                            <button
                              key={option}
                              onClick={() => handleVote(a.id, option)}
                              disabled={voting === a.id}
                              className={`w-full text-left relative overflow-hidden rounded-lg border transition-colors ${
                                isSelected
                                  ? 'border-brand-blue bg-brand-blue/10'
                                  : 'border-gray-200 hover:border-brand-blue/50'
                              }`}
                            >
                              {/* Background bar */}
                              {userVote && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-brand-blue/20 transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              )}
                              <div className="relative flex items-center justify-between px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {isSelected && <Check size={14} className="text-brand-blue-dark" />}
                                  <span className="text-sm font-medium text-gray-700">{option}</span>
                                </div>
                                {userVote && (
                                  <span className="text-xs text-gray-500">{pct}% ({optionVotes})</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                        <p className="text-xs text-gray-400">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2">
                      Posted by {a.author_name}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

export default AnnouncementsView
