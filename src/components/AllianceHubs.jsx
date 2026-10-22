import { useState, useEffect, useRef } from 'react'
import { onlyMyTeam, stampTeam, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { Plus, Trash2, ArrowLeft, Send, X, MessageCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import NotificationBell from './NotificationBell'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const SENDER_COLORS = [
  { bg: '#FFE27A', name: '#F5C400' },
  { bg: '#D9DEE6', name: '#A9B2BF' },
  { bg: '#FFFFFF', name: '#999999' },
]

function getSenderColor(sender) {
  let hash = 0
  for (let i = 0; i < sender.length; i++) {
    hash = sender.charCodeAt(i) + ((hash << 5) - hash)
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length]
}

function AllianceHubs() {
  const { username, chatName, nickname, user, isTeam, teamNumber } = useUser()
  const { canDeleteAnyMessage, canDeleteOwnMessages, canUseChat, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [hubs, setHubs] = useState([])
  const [activeHub, setActiveHub] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [team1Input, setTeam1Input] = useState('')
  const [team2Input, setTeam2Input] = useState('')
  const [createError, setCreateError] = useState('')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendError, setSendError] = useState(null)
  const messagesEndRef = useRef(null)

  // Fetch all hubs
  const fetchHubs = async () => {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/alliance_hubs?${SCOPE}&order=created_at.desc&select=*`,
        { headers: restHeaders() }
      )
      if (res.ok) {
        setHubs(await res.json())
      }
    } catch (err) {
      console.error('Failed to load hubs:', err)
    }
  }

  useEffect(() => { fetchHubs() }, [])

  // Real-time hub changes
  useEffect(() => {
    const sub = supabase
      .channel('alliance-hubs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alliance_hubs' }, () => {
        fetchHubs()
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  // Create hub
  const handleCreate = async () => {
    const t1 = team1Input.trim()
    const t2 = team2Input.trim()
    if (!t1 || !t2) { setCreateError('Enter both team numbers.'); return }
    if (t1 === t2) { setCreateError('Teams must be different.'); return }

    // Sort so team1 < team2 to enforce uniqueness
    const [sorted1, sorted2] = [t1, t2].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    // Check for duplicate locally
    if (hubs.some(h => h.team1 === sorted1 && h.team2 === sorted2)) {
      setCreateError('A hub with these two teams already exists.')
      return
    }

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/alliance_hubs`, {
        method: 'POST',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        // Stamped, so a hub a sister team makes is theirs, not Radical's.
        body: JSON.stringify(stampTeam({
          team1: sorted1,
          team2: sorted2,
          created_by: isTeam ? `${teamNumber} ${username}` : username,
        }, myTeamNumber)),
      })
      if (res.ok) {
        setShowCreate(false)
        setTeam1Input('')
        setTeam2Input('')
        setCreateError('')
        fetchHubs()
      } else if (res.status === 409) {
        setCreateError('A hub with these two teams already exists.')
      } else {
        setCreateError('Failed to create hub.')
      }
    } catch {
      setCreateError('Failed to create hub.')
    }
  }

  // Delete hub
  const handleDeleteHub = async (hubId) => {
    setHubs(prev => prev.filter(h => h.id !== hubId))
    // Also delete all messages for this hub
    await fetch(`${supabaseUrl}/rest/v1/messages?channel=eq.alliance-${hubId}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(() => {})
    await fetch(`${supabaseUrl}/rest/v1/alliance_hubs?id=eq.${hubId}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(err => console.error('Failed to delete hub:', err))
  }

  // --- Chat inside a hub ---
  const channel = activeHub ? `alliance-${activeHub.id}` : null

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = async () => {
    if (!channel) return
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/messages?${SCOPE}&created_at=gte.${encodeURIComponent(cutoff)}&channel=eq.${channel}&order=created_at.desc&limit=100&select=id,sender,content,created_at,seen_by,channel`,
        { headers: restHeaders() }
      )
      if (!res.ok) return
      const data = await res.json()
      data.reverse()
      setMessages(data)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  useEffect(() => {
    if (!activeHub) { setMessages([]); return }
    fetchMessages()
    // Realtime below delivers new messages; this is the safety net for a
    // dropped socket, so it's slow and sits out while the tab is hidden.
    const poll = () => { if (document.visibilityState === 'visible') fetchMessages() }
    const interval = setInterval(poll, 20000)
    document.addEventListener('visibilitychange', poll)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', poll) }
  }, [activeHub])

  useEffect(() => {
    if (!channel) return
    const sub = supabase
      .channel('alliance-chat-' + channel)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onlyMyTeam((payload) => {
        if (payload.new.channel !== channel) return
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, onlyMyTeam((payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      }))
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channel])

  useEffect(() => { scrollToBottom() }, [messages])

  const handleSend = (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !channel) return

    const message = stampTeam({
      id: (user?.id || 'anon') + ':' + Date.now() + Math.random().toString(36).slice(2),
      sender: isTeam ? `${teamNumber} ${username}` : username,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      channel,
    }, myTeamNumber)

    setNewMessage('')
    setMessages(prev => [...prev, message])

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
        setMessages(prev => prev.filter(m => m.id !== message.id))
        setSendError('Message failed to send. Try again.')
        setTimeout(() => setSendError(null), 4000)
      }
    }).catch(() => {
      setMessages(prev => prev.filter(m => m.id !== message.id))
      setSendError('Message failed to send. Try again.')
      setTimeout(() => setSendError(null), 4000)
    })
  }

  const handleDeleteMsg = (msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId))
    fetch(`${supabaseUrl}/rest/v1/messages?id=eq.${msgId}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(() => {})
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

  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.created_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  // --- Hub chat view ---
  if (activeHub) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
          <div className="py-4 px-4 pl-14 md:pl-4 flex items-center gap-3 text-gray-200">
            <button onClick={() => setActiveHub(null)} className="p-1 hover:bg-gray-800 rounded-lg">
              <ArrowLeft size={20} className="text-gray-200" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
                Team {activeHub.team1} & Team {activeHub.team2}
              </h1>
            </div>
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.length === 0 && (
              <p className="text-center text-gray-400 mt-20">No messages yet. Say something!</p>
            )}
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex justify-center my-4">
                  <span className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full shadow-sm">{date}</span>
                </div>
                {msgs.map((msg) => {
                  const isOwn = user && msg.id.startsWith(user.id + ':')
                  const senderColor = !isOwn ? getSenderColor(msg.sender) : null
                  return (
                    <div key={msg.id} className={`flex mb-3 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`relative group max-w-[75%] rounded-2xl px-4 py-2 shadow-sm text-gray-800 ${
                          isOwn ? 'bg-brand-blue rounded-br-md' : 'rounded-bl-md'
                        }`}
                        style={senderColor ? { backgroundColor: senderColor.bg } : undefined}
                      >
                        {(canDeleteAnyMessage || (canDeleteOwnMessages && isOwn)) && (
                          <button
                            onClick={() => handleDeleteMsg(msg.id)}
                            className={`absolute -top-2 ${isOwn ? '-left-2' : '-right-2'} p-1 rounded-full bg-white shadow-md hover:bg-red-50`}
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
                        <p className={`text-[10px] mt-1 text-gray-${isOwn ? '500' : '400'} text-right`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        <div className="bg-white/80 backdrop-blur-sm border-t p-3">
          {sendError && <p className="text-xs text-red-500 text-center mb-2">{sendError}</p>}
          <form onSubmit={handleSend} className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
            <button type="submit" className="p-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-full transition-colors">
              <Send size={18} className="text-gray-700" />
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- Hub list view ---
  // Alliance hubs are chat — same co-founder-only rule as the other channels.
  if (!canUseChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 gap-3 p-8">
        <MessageCircle size={48} className="text-gray-300" />
        <h2 className="text-lg font-bold text-gray-500">Chat is closed right now</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs">Only co-founders have chat access at the moment.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="py-4 px-4 flex items-center text-gray-200">
          <div className="w-10 shrink-0 text-gray-200" />
          <div className="flex-1 text-center">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Alliances
            </h1>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-md mx-auto space-y-3">
          {/* Create hub button */}
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-blue/30 hover:bg-brand-blue/50 rounded-xl transition-colors text-gray-600"
          >
            <Plus size={18} />
            <span>Create Alliance Hub</span>
          </button>

          {/* Create modal */}
          {showCreate && (
            <div className="bg-white rounded-xl shadow-md p-4 space-y-3 border border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">New Alliance Hub</h3>
                <button onClick={() => { setShowCreate(false); setCreateError('') }} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={team1Input}
                  onChange={(e) => setTeam1Input(e.target.value)}
                  placeholder="Team 1 (e.g. 254)"
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                />
                <input
                  type="text"
                  value={team2Input}
                  onChange={(e) => setTeam2Input(e.target.value)}
                  placeholder="Team 2 (e.g. 1234)"
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                />
              </div>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
              <button
                onClick={handleCreate}
                className="w-full py-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg transition-colors text-gray-700 font-medium text-sm"
              >
                Create Hub
              </button>
            </div>
          )}

          {/* Hub list */}
          {hubs.length === 0 && !showCreate && (
            <p className="text-center text-gray-400 mt-16">No alliance hubs yet. Create one to start chatting!</p>
          )}

          {hubs.map(hub => (
            <div
              key={hub.id}
              className="flex items-center bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
            >
              <div
                className="flex-1 px-4 py-3"
                onClick={() => setActiveHub(hub)}
              >
                <p className="font-medium text-gray-700">Team {hub.team1} & Team {hub.team2}</p>
                <p className="text-xs text-gray-400">Created {new Date(hub.created_at).toLocaleDateString()}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteHub(hub.id) }}
                className="px-3 py-3 hover:bg-red-50 transition-colors"
                title="Delete hub"
              >
                <Trash2 size={16} className="text-gray-400 hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default AllianceHubs
