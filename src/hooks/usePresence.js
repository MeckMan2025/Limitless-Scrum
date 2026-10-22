import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

export function usePresence(username) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [presenceState, setPresenceState] = useState({})
  const channelRef = useRef(null)

  // Always subscribe to presence sync (even before login)
  useEffect(() => {
    const channel = supabase.channel('online-presence', {
      config: { presence: { key: username || '_anonymous' } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setPresenceState(state)
        const users = Object.entries(state).map(([key, presences]) => ({
          username: key,
          online_at: presences[0]?.online_at,
        }))
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && username) {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [username])

  return { onlineUsers, presenceState }
}
