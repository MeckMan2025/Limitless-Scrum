import { useState, useEffect, useCallback } from 'react'
import { onlyMyTeam, scopeQuery, stampStored } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { triggerPush } from '../utils/pushHelper'

export function usePendingRequests({ type, boardId } = {}) {
  const { username, user } = useUser()
  const [requests, setRequests] = useState([])

  useEffect(() => {
    async function load() {
      let query = scopeQuery(supabase
        .from('requests')
        .select('*'))
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (type) query = query.eq('type', type)
      if (boardId) query = query.eq('board_id', boardId)

      const { data, error } = await query
      if (error) {
        console.error('Failed to load requests:', error.message)
        return
      }
      if (data) setRequests(data)
    }
    load()
  }, [type, boardId])

  useEffect(() => {
    const channelName = `requests-badge-${type || 'all'}-${boardId || 'all'}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, onlyMyTeam((payload) => {
        const r = payload.new
        if (r.status !== 'pending') return
        if (type && r.type !== type) return
        if (boardId && r.board_id !== boardId) return
        setRequests(prev => {
          if (prev.some(x => x.id === r.id)) return prev
          return [r, ...prev]
        })
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, onlyMyTeam((payload) => {
        if (payload.new.status !== 'pending') {
          setRequests(prev => prev.filter(r => r.id !== payload.new.id))
        }
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'requests' }, onlyMyTeam((payload) => {
        setRequests(prev => prev.filter(r => r.id !== payload.old.id))
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [type, boardId])

  const handleApprove = useCallback(async (request) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const headers = restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })

    try {
      if (request.type === 'task') {
        const d = request.data
        const task = {
          id: String(Date.now()),
          board_id: request.board_id || 'business',
          title: d.title,
          description: d.description || '',
          assignee: d.assignee || '',
          due_date: d.dueDate || '',
          status: d.status || 'todo',
          skills: d.skills || [],
          created_at: new Date().toISOString().split('T')[0],
        }
        await fetch(`${supabaseUrl}/rest/v1/tasks`, {
          method: 'POST', headers, body: JSON.stringify(task),
        })
      } else if (request.type === 'calendar_event') {
        const d = request.data
        const event = {
          id: String(Date.now()),
          date_key: d.date_key,
          name: d.name,
          description: d.description || '',
          added_by: request.requested_by,
          event_type: d.event_type || 'other',
        }
        await fetch(`${supabaseUrl}/rest/v1/calendar_events`, {
          method: 'POST', headers, body: JSON.stringify(event),
        })
      } else if (request.type === 'board') {
        const board = {
          id: String(Date.now()),
          name: request.data.name,
          permanent: false,
        }
        await fetch(`${supabaseUrl}/rest/v1/boards`, {
          method: 'POST', headers, body: JSON.stringify(board),
        })
      } else if (request.type === 'leave_task') {
        // Set the task's assignee back to "Up for Grabs"
        const taskId = request.data?.task_id
        if (taskId) {
          await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ assignee: '__up_for_grabs__' }),
          })
        }
      } else if (request.type === 'role_request') {
        // Add the requested role to the user's function_tags
        const targetUserId = request.requested_by_user_id
        if (targetUserId) {
          const profileRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${targetUserId}&select=function_tags`,
            { headers: restHeaders() }
          )
          if (profileRes.ok) {
            const profiles = await profileRes.json()
            const currentTags = profiles[0]?.function_tags || []
            const newRole = request.data?.role
            if (newRole && !currentTags.includes(newRole)) {
              await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${targetUserId}`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ function_tags: [...currentTags, newRole] }),
              })
            }
          }
        }
      }

      // Mark request as approved
      await fetch(`${supabaseUrl}/rest/v1/requests?id=eq.${request.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          status: 'approved',
          reviewed_by: username,
          reviewed_at: new Date().toISOString(),
        }),
      })

      // Notify requester
      if (request.requested_by_user_id) {
        const approvalNotif = {
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          user_id: request.requested_by_user_id,
          type: 'request_approved',
          title: 'Request Approved',
          body: `Your ${request.type === 'role_request' ? 'role' : request.type === 'leave_task' ? 'leave task' : request.type === 'task' ? 'task' : request.type === 'board' ? 'board' : 'event'} request "${request.data?.role || request.data?.title || request.data?.name}" was approved by ${username}.`,
        }
        try {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: 'POST', headers,
            body: JSON.stringify(approvalNotif),
          })
          triggerPush(approvalNotif)
        } catch (err) {
          console.error('Failed to notify:', err)
        }
      }

      // If approving a calendar_event with notify, send notifications to all users
      if (request.type === 'calendar_event' && request.data?.notify) {
        try {
          const { data: profiles } = await supabase.from('profiles').select('id,function_tags')
          if (profiles) {
            const body = request.data.notify_message || `New event: ${request.data.name} on ${request.data.date_key}`
            for (const p of profiles) {
              if (p.id === request.requested_by_user_id) continue
              if ((p.function_tags || []).includes('Team')) continue
              const notifRecord = {
                id: String(Date.now()) + Math.random().toString(36).slice(2) + p.id.slice(0, 4),
                user_id: p.id,
                type: 'calendar_event',
                title: `Calendar: ${request.data.name}`,
                body,
                force: !!request.data.force_notify,
              }
              await supabase.from('notifications').insert(notifRecord)
              triggerPush(notifRecord)
            }
          }
        } catch (err) {
          console.error('Failed to send calendar notifications on approval:', err)
        }
      }

      setRequests(prev => prev.filter(r => r.id !== request.id))
    } catch (err) {
      console.error('Error approving request:', err)
    }
  }, [username])

  const handleDeny = useCallback(async (request, reason = '') => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const headers = restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })

    try {
      await fetch(`${supabaseUrl}/rest/v1/requests?id=eq.${request.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          status: 'denied',
          reviewed_by: username,
          reviewed_at: new Date().toISOString(),
          decision_reason: reason,
        }),
      })

      // Notify requester
      if (request.requested_by_user_id) {
        const denialNotif = {
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          user_id: request.requested_by_user_id,
          type: 'request_denied',
          title: 'Request Denied',
          body: `Your ${request.type === 'role_request' ? 'role' : request.type === 'leave_task' ? 'leave task' : request.type === 'task' ? 'task' : request.type === 'board' ? 'board' : 'event'} request "${request.data?.role || request.data?.title || request.data?.name}" was denied by ${username}.${reason ? ' Reason: ' + reason : ''}`,
        }
        try {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: 'POST', headers,
            body: JSON.stringify(denialNotif),
          })
          triggerPush(denialNotif)
        } catch (err) {
          console.error('Failed to notify:', err)
        }
      }

      setRequests(prev => prev.filter(r => r.id !== request.id))
    } catch (err) {
      console.error('Error denying request:', err)
    }
  }, [username])

  const handleRemind = useCallback(async (request) => {
    if (!user) return { success: false, error: 'Not logged in' }

    try {
      // Check cooldown (1 hour)
      const { data: recentReminders } = await supabase
        .from('request_reminders')
        .select('reminded_at')
        .eq('request_id', request.id)
        .eq('reminded_by_user_id', user.id)
        .order('reminded_at', { ascending: false })
        .limit(1)

      if (recentReminders && recentReminders.length > 0) {
        const lastRemind = new Date(recentReminders[0].reminded_at)
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
        if (lastRemind > hourAgo) {
          return { success: false, error: 'Please wait 1 hour between reminders' }
        }
      }

      // Insert reminder record
      await supabase.from('request_reminders').insert(stampStored({
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        request_id: request.id,
        reminded_by_user_id: user.id,
      }))

      // Get all top-tier approvers
      const { data: approvers } = await supabase
        .from('profiles')
        .select('id')
        .eq('authority_tier', 'top')

      // Insert notification for each approver
      if (approvers && approvers.length > 0) {
        const notifications = approvers.map(a => ({
          id: String(Date.now()) + Math.random().toString(36).slice(2) + a.id.slice(0, 4),
          user_id: a.id,
          type: 'request_reminder',
          title: 'Request Reminder',
          body: `${username} is reminding you about a pending ${request.type === 'leave_task' ? 'leave task' : request.type === 'task' ? 'task' : request.type === 'board' ? 'board' : 'event'} request: "${request.data?.title || request.data?.name}"`,
        }))
        await supabase.from('notifications').insert(notifications)
        notifications.forEach(n => triggerPush(n))
      }

      return { success: true }
    } catch (err) {
      console.error('Error sending reminder:', err)
      return { success: false, error: err.message }
    }
  }, [user, username])

  return { requests, count: requests.length, handleApprove, handleDeny, handleRemind }
}
