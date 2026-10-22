import { useState, useEffect, useRef, Component } from 'react'
import { onlyMyTeam, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { Send, Trash2 } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import NotificationBell from './NotificationBell'
import { triggerPush } from '../utils/pushHelper'
import { HOME_TEAM_NUMBER } from '../data/team'

class ChatErrorBoundary extends Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('Chat crashed:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
          <p className="text-gray-500">Chat ran into an error.</p>
          <button onClick={() => this.setState({ hasError: false })} className="px-4 py-2 bg-brand-blue rounded-lg text-sm hover:bg-brand-blue-dark transition-colors">
            Reload Chat
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const SENDER_COLORS = [
  { bg: '#FFE27A', name: '#F5C400' }, // pastel pink
  { bg: '#D9DEE6', name: '#A9B2BF' }, // pastel orange
  { bg: '#FFFFFF', name: '#999999' }, // white
]

function getSenderColor(sender) {
  if (!sender) return SENDER_COLORS[0]
  let hash = 0
  for (let i = 0; i < sender.length; i++) {
    hash = sender.charCodeAt(i) + ((hash << 5) - hash)
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length]
}

const CHANNEL_LABELS = { all: 'All', alliances: 'Alliances', leagues: 'Leagues' }

function QuickChat({ channel = 'all' }) {
  const { username, chatName, nickname, user, isTeam, teamNumber } = useUser()
  const { canUseChat, canDeleteOwnMessages, canDeleteAnyMessage, canPauseMuteChat, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendError, setSendError] = useState(null)
  const [myAvatarUrl, setMyAvatarUrl] = useState('')
  const messagesEndRef = useRef(null)
  const lastPushTimestamp = useRef(0)
  const seenIdsRef = useRef(new Set())
  const shouldScrollRef = useRef(true)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Mark messages from other users as seen (batched, deduped)
  const markMessagesAsSeen = (msgs) => {
    if (!username) return
    const unseen = msgs.filter(
      (m) => {
        if (seenIdsRef.current.has(m.id)) return false
        const isMine = (user && m.id.startsWith(user.id + ':')) || m.sender === username || m.sender === chatName || (nickname && m.sender === nickname)
        return !isMine && !m.seen_by?.includes(username)
      }
    )
    if (unseen.length === 0) return
    // Mark as processed immediately to prevent re-patching
    unseen.forEach(m => seenIdsRef.current.add(m.id))
    // Batch: patch one at a time with small delay to avoid hammering
    let i = 0
    const patchNext = () => {
      if (i >= unseen.length) return
      const m = unseen[i++]
      fetch(`${supabaseUrl}/rest/v1/messages?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ seen_by: [...(m.seen_by || []), username] }),
      }).catch(err => console.error('Failed to mark message as seen:', err))
        .finally(() => setTimeout(patchNext, 200))
    }
    patchNext()
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Load avatar URL from profile
  useEffect(() => {
    if (!user) return
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=avatar_url`, {
      headers: restHeaders(),
    })
      .then(res => res.ok ? res.json() : [])
      .then(rows => { if (rows[0]?.avatar_url) setMyAvatarUrl(rows[0].avatar_url) })
      .catch(() => {})
  }, [user?.id])

  // Fetch messages from DB via direct fetch
  const fetchMessages = async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/messages?${SCOPE}&created_at=gte.${encodeURIComponent(cutoff)}&channel=eq.${channel}&order=created_at.desc&limit=100&select=id,sender,content,created_at,seen_by,channel,avatar_url`,
        { headers: restHeaders() }
      )
      if (!res.ok) return
      const data = await res.json()
      data.reverse()
      setMessages(data)
      markMessagesAsSeen(data)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  // Load messages on mount + clean up old ones
  useEffect(() => {
    fetchMessages()

    // Clean up messages older than 24 hours from the DB
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    fetch(`${supabaseUrl}/rest/v1/messages?created_at=lt.${cutoff}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(err => console.error('Failed to clean up old messages:', err))
  }, [username, channel])

  // Re-fetch on tab wake + poll every 30s (while visible) as a safety net for
  // dropped realtime
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchMessages()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    const interval = setInterval(handleVisibility, 30000)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
  }, [username, channel])

  // Real-time subscription — filter client-side by channel
  useEffect(() => {
    const sub = supabase
      .channel('messages-changes-' + channel)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onlyMyTeam((payload) => {
        if ((payload.new.channel || 'all') !== channel) return
        const age = Date.now() - new Date(payload.new.created_at).getTime()
        if (age > 24 * 60 * 60 * 1000) return // ignore messages older than 24h
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
        markMessagesAsSeen([payload.new])
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, onlyMyTeam((payload) => {
        if ((payload.new.channel || 'all') !== channel) return
        setMessages(prev => {
          const old = prev.find(m => m.id === payload.new.id)
          // Skip re-render if only seen_by changed (prevents render storm)
          if (old && old.content === payload.new.content && old.sender === payload.new.sender) return prev
          return prev.map(m => m.id === payload.new.id ? payload.new : m)
        })
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, onlyMyTeam((payload) => {
        if (!payload.old?.id) return
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      }))
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [channel])

  // Auto-scroll only when new messages arrive (not on seen_by updates)
  const prevCountRef = useRef(0)
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollToBottom()
    }
    prevCountRef.current = messages.length
  }, [messages])

  const handleSend = (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const message = {
      id: (user?.id || 'anon') + ':' + Date.now() + Math.random().toString(36).slice(2),
      sender: isTeam ? `${teamNumber} ${username}` : `${HOME_TEAM_NUMBER} Limitless Scrum`,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      channel,
      ...(myAvatarUrl ? { avatar_url: myAvatarUrl } : {}),
    }

    setNewMessage('')
    setMessages(prev => [...prev, message])

    // Use direct fetch — supabase client .insert() can hang
    fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        ...restHeaders(),
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(message),
    }).then(res => {
      if (!res.ok) {
        console.error('Failed to send message:', res.status)
        setMessages(prev => prev.filter(m => m.id !== message.id))
        setSendError('Message failed to send. Try again.')
        setTimeout(() => setSendError(null), 4000)
      } else {
        // Send push notification to other users (30s cooldown)
        const now = Date.now()
        if (now - lastPushTimestamp.current > 30000) {
          lastPushTimestamp.current = now
          const senderName = isTeam ? `${teamNumber} ${username}` : `${HOME_TEAM_NUMBER} Limitless Scrum`
          const channelLabel = CHANNEL_LABELS[channel] || 'All'
          const truncatedMsg = message.content.length > 80 ? message.content.slice(0, 80) + '...' : message.content
          supabase.from('profiles').select('id').then(({ data: profiles }) => {
            if (!profiles) return
            for (const p of profiles) {
              if (p.id === user?.id) continue
              triggerPush({
                user_id: p.id,
                type: 'chat_message',
                title: `${senderName} in Chat (${channelLabel})`,
                body: truncatedMsg,
              })
            }
          }).catch(err => console.error('Failed to fetch profiles for push:', err))
        }
      }
    }).catch(err => {
      console.error('Failed to send message:', err)
      setMessages(prev => prev.filter(m => m.id !== message.id))
      setSendError('Message failed to send. Try again.')
      setTimeout(() => setSendError(null), 4000)
    })
  }

  const handleDelete = (msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId))

    fetch(`${supabaseUrl}/rest/v1/messages?id=eq.${msgId}`, {
      method: 'DELETE',
      headers: {
        ...restHeaders(),
      },
    }).catch(err => console.error('Failed to delete message:', err))
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.created_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  if (!canUseChat) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400">You don't have access to the chat.</p>
      </div>
    )
  }

  if (channel === 'alliances' || channel === 'leagues') {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
          <div className="py-4 px-4 flex items-center text-gray-200">
            <div className="w-10 shrink-0 text-gray-200" />
            <div className="flex-1 text-center">
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
                {channel === 'alliances' ? 'Alliances' : 'Leagues'}
              </h1>
            </div>
            <NotificationBell />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-lg">Kayden and Yukti are working on it &lt;3</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="py-4 px-4 flex items-center text-gray-200">
          {/* Spacer to match hamburger width */}
          <div className="w-10 shrink-0 text-gray-200" />
          {/* Centered title */}
          <div className="flex-1 text-center">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Chat
            </h1>
          </div>
          <NotificationBell />
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 mt-20">No messages yet. Say something!</p>
          )}

          {Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              <div className="flex justify-center my-4">
                <span className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full shadow-sm">
                  {date}
                </span>
              </div>
              {msgs.map((msg) => {
                const isOwn = (user && msg.id.startsWith(user.id + ':'))
                const senderColor = !isOwn ? getSenderColor(msg.sender) : null
                return (
                  <div
                    key={msg.id}
                    className={`flex mb-3 items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isOwn && (msg.avatar_url ? (
                      <img src={msg.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mb-1" />
                    ) : (
                      <div className="w-7 h-7 shrink-0" />
                    ))}
                    <div
                      className={`relative group max-w-[75%] rounded-2xl px-4 py-2 shadow-sm text-gray-800 ${
                        isOwn
                          ? 'bg-brand-blue rounded-br-md'
                          : 'rounded-bl-md'
                      }`}
                      style={senderColor ? { backgroundColor: senderColor.bg } : undefined}
                    >
                      {(canDeleteAnyMessage || (canDeleteOwnMessages && isOwn)) && (
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className={`absolute -top-2 ${isOwn ? '-left-2' : '-right-2'} p-1 rounded-full bg-white shadow-md hover:bg-red-50`}
                          title="Delete message"
                        >
                          <Trash2 size={12} className="text-gray-400 hover:text-red-400" />
                        </button>
                      )}
                      <p
                        className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-brand-blue-dark' : ''}`}
                        style={senderColor ? { color: senderColor.name } : undefined}
                      >
                        {msg.sender}
                      </p>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isOwn ? 'text-gray-500 text-right' : 'text-gray-400 text-right'}`}>
                        {formatTime(msg.created_at)}
                      </p>
                      {isOwn && msg.seen_by?.filter(s => s !== username && s !== (nickname || '')).length > 0 && (
                        <p className="text-[10px] text-gray-400 text-right">Seen</p>
                      )}
                    </div>
                    {isOwn && (myAvatarUrl || msg.avatar_url) && (
                      <img src={myAvatarUrl || msg.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mb-1" />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="bg-white/80 backdrop-blur-sm border-t p-3">
        {sendError && (
          <p className="text-xs text-red-500 text-center mb-2">{sendError}</p>
        )}
        <form onSubmit={handleSend} className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-brand-blue focus:border-transparent"
          />
          <button
            type="submit"
            className="p-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-full transition-colors"
          >
            <Send size={18} className="text-gray-700" />
          </button>
        </form>
      </div>
    </div>
  )
}

export default function QuickChatWithBoundary(props) {
  return <ChatErrorBoundary><QuickChat {...props} /></ChatErrorBoundary>
}
