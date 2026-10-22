import { useState, useEffect, useMemo, useRef } from 'react'
import { onlyMyTeam, stampStored, stampTeam, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { notifyLeadOfCoLeadAction } from '../lib/coLeadNotice'
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil,
  CalendarDays, CalendarRange, Calendar as CalendarIcon, List,
  ChevronDown, ChevronUp, Repeat, AlertCircle,
} from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { ROLE_NAMES } from '../data/roleTrackers'
import { notifyRequestReviewers } from '../utils/requestRouting'
import { usePermissions, canAddEventsFromTags } from '../hooks/usePermissions'
import { usePushNotifications } from '../hooks/usePushNotifications'
import NotificationBell from './NotificationBell'
import { useToast } from './ToastProvider'
import RequestsBadge from './RequestsBadge'

// ---------------------------------------------------------------------------
// Categories, departments, priorities
// ---------------------------------------------------------------------------
const CATEGORIES = {
  meeting:     { label: 'Meeting',     emoji: '🔵', color: '#3b82f6', soft: '#dbeafe', text: '#1d4ed8', dept: ['team', 'business'] },
  competition: { label: 'Competition', emoji: '🏆', color: '#ef4444', soft: '#fee2e2', text: '#b91c1c', dept: ['team'] },
  outreach:    { label: 'Outreach',    emoji: '🌱', color: '#22c55e', soft: '#dcfce7', text: '#15803d', dept: ['business'] },
  workshop:    { label: 'Workshop',    emoji: '🛠️', color: '#a855f7', soft: '#f3e8ff', text: '#7e22ce', dept: ['programming', 'technical'] },
  birthday:    { label: 'Birthday',    emoji: '🎂', color: '#ec4899', soft: '#fce7f3', text: '#be185d', dept: ['team'] },
  fundraising: { label: 'Fundraising', emoji: '💰', color: '#f97316', soft: '#ffedd5', text: '#c2410c', dept: ['business'] },
  finance:     { label: 'Finance Deadline', emoji: '💸', color: '#eab308', soft: '#fef9c3', text: '#a16207', dept: ['business'] },
  // A deadline rather than something you turn up to. Teal so it doesn't read
  // as a Finance Deadline, which is yellow and means money specifically.
  due:         { label: 'Due Date',    emoji: '📋', color: '#06b6d4', soft: '#cffafe', text: '#0e7490', dept: ['team', 'business', 'programming', 'technical'] },
  // For anything that isn't one of the above — kept neutral so it doesn't
  // read as a category with its own meaning.
  other:       { label: 'Other',       emoji: '📌', color: '#6b7280', soft: '#f3f4f6', text: '#4b5563', dept: ['team'] },
}

// Quick-picks for the finance category — the deadlines Finance schedules most.
const FINANCE_DEADLINES = [
  'Registration payment due', 'Reimbursements due', 'Sponsor payment expected',
  'Fundraiser', 'Budget review', 'Purchasing deadline',
]

// The filter list is built from the Boards tab, so adding a board adds a
// calendar filter that shows that board's tasks. Only these three are fixed.
const BOARD_EMOJI = { business: '💼', programming: '💻', technical: '🔧' }
const boardFilters = (tabs) => [
  { id: 'all',  label: 'All',  emoji: '📅' },
  { id: 'team', label: 'Team', emoji: '👥' },
  ...(tabs || [])
    .filter(t => !t.type)
    .map(b => ({ id: b.id, label: b.name, emoji: BOARD_EMOJI[b.id] || '📋' })),
  { id: 'mine', label: 'My Calendar', emoji: '⭐' },
]

const PRIORITIES = {
  critical: { label: 'Critical',  badge: 'bg-red-100 text-red-700',     ring: '#ef4444' },
  important:{ label: 'Important', badge: 'bg-amber-100 text-amber-700', ring: '#f59e0b' },
  normal:   { label: 'Normal',    badge: 'bg-gray-100 text-gray-500',   ring: 'transparent' },
}

const TASK_PRIORITY_COLOR = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#9ca3af',
  low:      '#d1d5db',
}

const REACTION_EMOJIS = ['🎉', '🎂', '🥳', '🤖', '💚']
const VIEWS = [
  { id: 'month',  label: 'Month',  Icon: CalendarDays },
  { id: 'week',   label: 'Week',   Icon: CalendarRange },
  { id: 'day',    label: 'Day',    Icon: CalendarIcon },
  { id: 'agenda', label: 'Agenda', Icon: List },
]

// ---------------------------------------------------------------------------
// Date helpers (string-based, "YYYY-MM-DD" — avoids timezone surprises)
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0')
const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const startOfWeek = (d) => addDays(d, -d.getDay())
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const formatHuman = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const formatTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const hh = ((h + 11) % 12) + 1
  return `${hh}:${pad2(m || 0)} ${period}`
}

// Compute when a reminder for this event should fire. Returns a Date or null
// (null = skip — no start_time + reminder.disabled, or computed time is in the past).
function computeReminderSendAt(event) {
  const r = event.metadata?.reminder || {}
  if (r.disabled) return null
  if (!event.date_key) return null
  let sendAt
  if (event.start_time) {
    const minutesBefore = typeof r.minutes_before === 'number' ? r.minutes_before : 60
    const start = new Date(`${event.date_key}T${event.start_time}:00`)
    sendAt = new Date(start.getTime() - minutesBefore * 60_000)
  } else {
    // All-day: 8 AM on the date_key
    sendAt = new Date(`${event.date_key}T08:00:00`)
  }
  if (Number.isNaN(sendAt.getTime())) return null
  if (sendAt.getTime() < Date.now()) return null
  return sendAt
}

// Expand a recurring event into concrete date_keys within [from, to] (inclusive).
function expandRecurrence(event, from, to) {
  if (!event.date_key) return []
  const start = fromKey(event.date_key)
  if (Number.isNaN(start.getTime())) return []
  const exceptions = new Set(event.exception_dates || [])
  if (!event.recurrence || event.recurrence === 'none') {
    if (start < from || start > to) return []
    return exceptions.has(toKey(start)) ? [] : [toKey(start)]
  }
  const until = event.recurrence_until ? fromKey(event.recurrence_until) : to
  const stop = until < to ? until : to
  const keys = []
  let cursor = new Date(start)
  for (let i = 0; i < 366 * 5 && cursor <= stop; i++) {
    const k = toKey(cursor)
    if (cursor >= from && !exceptions.has(k)) keys.push(k)
    if (event.recurrence === 'daily')   cursor = addDays(cursor, 1)
    else if (event.recurrence === 'weekly')  cursor = addDays(cursor, 7)
    else if (event.recurrence === 'monthly') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate())
    else if (event.recurrence === 'yearly')  cursor = new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate())
    else break
  }
  return keys
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------
function CalendarView({ tabs = [], tasksByTab = {}, onOpenTask } = {}) {
  const { username, user, functionTags, isTeam } = useUser()
  const { canEditContent, canReviewRequests, isGuest, canAddEvents, hasLeadTag, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  // A non-lead's events are tagged with the functional role that let them
  // create it — Outreach can only add Outreach events. Leads create team-wide
  // events (role stays null).
  const eventRole = hasLeadTag
    ? null
    : (functionTags || []).find(t => ROLE_NAMES.includes(t)) || null
  const isCofounder = (functionTags || []).includes('Co-Founder')
  const { addToast } = useToast()
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, subscribe: pushSubscribe } = usePushNotifications()

  const [view, setView] = useState(() => localStorage.getItem('calendar-view') || 'month')
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useState(() => {
    // Hydrate from localStorage so the calendar paints instantly while the
    // fresh fetch happens in the background.
    try {
      const cached = localStorage.getItem('calendar-events-cache')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [reactions, setReactions] = useState(() => {
    try {
      const cached = localStorage.getItem('calendar-reactions-cache')
      return cached ? JSON.parse(cached) : {}
    } catch { return {} }
  })
  const [filter, setFilter] = useState('all')      // all | team | business | programming | technical | mine
  const [showDashboard, setShowDashboard] = useState(() => localStorage.getItem('calendar-dashboard') !== '0')
  const [openEvent, setOpenEvent] = useState(null) // event currently in modal
  const [creating, setCreating] = useState(null)   // { date_key } when add form open
  const [editing, setEditing] = useState(null)     // event being edited
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => { localStorage.setItem('calendar-view', view) }, [view])
  useEffect(() => { localStorage.setItem('calendar-dashboard', showDashboard ? '1' : '0') }, [showDashboard])

  // ---------------------------------------------------------------------- Load
  useEffect(() => {
    let alive = true
    async function load() {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      try {
        const res = await fetch(`${url}/rest/v1/calendar_events?${SCOPE}&order=date_key.asc&select=*`, {
          headers: restHeaders(),
        })
        const data = await res.json()
        if (!alive || !Array.isArray(data)) return
        setEvents(data)
        try { localStorage.setItem('calendar-events-cache', JSON.stringify(data)) } catch {}
      } catch (err) {
        console.error('Calendar load failed:', err)
      }
    }
    load()
    // Patch state in place instead of refetching — avoids races that wipe
    // optimistic inserts before the new row is visible to a SELECT.
    const channel = supabase
      .channel('calendar-events-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_events' }, onlyMyTeam((payload) => {
        setEvents(prev => prev.some(e => e.id === payload.new.id) ? prev : [...prev, payload.new])
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calendar_events' }, onlyMyTeam((payload) => {
        setEvents(prev => prev.map(e => e.id === payload.new.id ? payload.new : e))
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calendar_events' }, onlyMyTeam((payload) => {
        setEvents(prev => prev.filter(e => e.id !== payload.old.id))
      }))
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      try {
        const res = await fetch(`${url}/rest/v1/calendar_birthday_reactions?${SCOPE}&select=*`, {
          headers: restHeaders(),
        })
        const data = await res.json()
        if (!alive || !Array.isArray(data)) return
        const grouped = {}
        data.forEach(r => {
          if (!grouped[r.event_id]) grouped[r.event_id] = []
          grouped[r.event_id].push({ id: r.id, username: r.username, emoji: r.emoji })
        })
        setReactions(grouped)
        try { localStorage.setItem('calendar-reactions-cache', JSON.stringify(grouped)) } catch {}
      } catch (err) {
        console.error('Calendar reactions load failed:', err)
      }
    }
    load()
    const channel = supabase
      .channel('calendar-reactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_birthday_reactions' }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [])

  // ---------------------------------------------------------------------- Tasks
  // Flatten tasks across all boards into pseudo-events keyed by due_date.
  const taskEvents = useMemo(() => {
    const out = []
    Object.entries(tasksByTab).forEach(([boardId, list]) => {
      ;(list || []).forEach(t => {
        if (!t.due_date) return
        out.push({
          id: 'task:' + t.id,
          isTask: true,
          task: { ...t, board_id: t.board_id || boardId },
          date_key: t.due_date,
          name: t.title,
          category: 'task',
          priority: t.priority || 'medium',
          assignee: t.assignee,
          status: t.status,
        })
      })
    })
    return out
  }, [tasksByTab])

  const departments = useMemo(() => boardFilters(tabs), [tabs])

  // A deleted board would otherwise leave the calendar stuck on an empty filter.
  useEffect(() => {
    if (!departments.some(d => d.id === filter)) setFilter('all')
  }, [departments, filter])

  // ---------------------------------------------------------------------- Filter
  const eventMatches = (ev) => {
    if (filter === 'all') return true
    if (filter === 'mine') {
      if (ev.isTask) return (ev.assignee || '').toLowerCase() === (username || '').toLowerCase()
      const assigned = ev.assigned_to || []
      if (assigned.map(s => s.toLowerCase()).includes((username || '').toLowerCase())) return true
      // Events belonging to a role you hold are yours (Finance deadlines for
      // Finance, Outreach events for Outreach), as are events you created.
      if (ev.role && (functionTags || []).includes(ev.role)) return true
      if (ev.added_by && ev.added_by === username) return true
      return false
    }
    // Department filters
    if (ev.isTask) {
      // A task belongs to the board it lives on, so picking that board shows it.
      return (ev.task?.board_id || '') === filter
    }
    if (ev.department && ev.department === filter) return true
    // Allow categories to show in their natural department even if dept is unset.
    const cat = CATEGORIES[ev.category] || CATEGORIES[ev.event_type]
    if (cat && cat.dept.includes(filter)) return true
    return false
  }

  // Build [from, to] for the current view to drive recurrence expansion.
  const viewRange = useMemo(() => {
    if (view === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      return { from: addDays(startOfWeek(first), -7), to: addDays(last, 14) }
    }
    if (view === 'week') {
      const start = startOfWeek(cursor)
      return { from: start, to: addDays(start, 6) }
    }
    if (view === 'day') {
      return { from: cursor, to: cursor }
    }
    // agenda — next 60 days
    return { from: cursor, to: addDays(cursor, 60) }
  }, [view, cursor])

  // Map of date_key -> [event-instance], with recurrence expanded and filter applied.
  const eventsByDay = useMemo(() => {
    const map = {}
    const push = (key, instance) => { (map[key] = map[key] || []).push(instance) }
    events.forEach(ev => {
      if (!eventMatches(ev)) return
      const keys = expandRecurrence(ev, viewRange.from, viewRange.to)
      keys.forEach(k => push(k, { ...ev, date_key: k, _baseKey: ev.date_key }))
    })
    taskEvents.forEach(t => { if (eventMatches(t)) push(t.date_key, t) })
    Object.values(map).forEach(list => list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')))
    return map
  }, [events, taskEvents, filter, viewRange.from, viewRange.to, username]) // eslint-disable-line

  // ---------------------------------------------------------------------- Reminders
  const scheduleReminder = async (event) => {
    const sendAt = computeReminderSendAt(event)
    if (!sendAt) return
    const r = event.metadata?.reminder || {}
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    const cat = CATEGORIES[event.category] || CATEGORIES[event.event_type] || CATEGORIES.meeting
    // Stamped with the team, so process-scheduled sends it to this team only.
    const row = stampTeam({
      id: 'sn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      event_id: event.id,
      send_at: sendAt.toISOString(),
      title: `${cat.emoji} ${event.name}`,
      body: r.message || (event.start_time ? `Starts at ${formatTime(event.start_time)}${event.location ? ' · ' + event.location : ''}` : `Today${event.location ? ' · ' + event.location : ''}`),
      type: 'calendar_event',
      force: false,
      created_by: username,
      created_by_user_id: user?.id || null,
      status: 'pending',
    }, myTeamNumber)
    try {
      await fetch(`${url}/rest/v1/scheduled_notifications`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(row),
      })
    } catch (err) {
      console.error('Failed to schedule reminder:', err)
    }
  }

  const cancelReminders = async (eventId) => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    try {
      await fetch(`${url}/rest/v1/scheduled_notifications?event_id=eq.${encodeURIComponent(eventId)}&status=eq.pending`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'cancelled' }),
      })
    } catch (err) {
      console.error('Failed to cancel reminders:', err)
    }
  }

  // ---------------------------------------------------------------------- Handlers
  const handleCreate = async (payload) => {
    const newEvent = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      date_key: payload.date_key,
      name: payload.name,
      description: payload.description || '',
      added_by: username,
      event_type: payload.category, // back-compat
      category: payload.category,
      priority: payload.priority || 'normal',
      department: payload.department || (CATEGORIES[payload.category]?.dept[0] || 'team'),
      start_time: payload.start_time || '',
      end_time: payload.end_time || '',
      location: payload.location || '',
      metadata: payload.metadata || {},
      recurrence: payload.recurrence || 'none',
      recurrence_until: payload.recurrence_until || '',
      exception_dates: [],
      assigned_to: payload.assigned_to || [],
      role: eventRole,
    }

    // Close the modal immediately — never block the UI on the network round-trip.
    setCreating(null)

    // Guard against stale permissions: someone just demoted from a lead role can
    // still hold "lead" tags in cached state, which would let their event insert
    // directly. Re-check the live profile before allowing a direct add; if they
    // no longer qualify, it goes through the request queue like any teammate.
    let mayAddDirectly = canAddEvents
    if (canAddEvents && !isCofounder && !isTeam && user?.id) {
      try {
        const sUrl = import.meta.env.VITE_SUPABASE_URL
        const sKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        const rows = await fetch(
          `${sUrl}/rest/v1/profiles?id=eq.${user.id}&select=function_tags`,
          { headers: restHeaders() }
        ).then(r => (r.ok ? r.json() : null))
        const tags = rows?.[0]?.function_tags
        if (Array.isArray(tags)) mayAddDirectly = canAddEventsFromTags(tags)
      } catch { /* if the live check can't run, keep the cached decision */ }
    }

    if (!mayAddDirectly) {
      const request = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        type: 'calendar_event',
        data: newEvent,
        requested_by: username,
        requested_by_user_id: user?.id,
        status: 'pending',
      }
      addToast('Request sent! A lead will review it.', 'success')
      const { error } = await supabase.from('requests').insert(stampStored(request))
      if (error) { console.error(error); addToast('Could not submit request: ' + error.message, 'error') }
      else notifyRequestReviewers(request)
      return
    }

    setEvents(prev => [...prev, newEvent])
    addToast('Event created', 'success')
    // A member would have had to request this; a co-lead just does it, so the
    // lead they share the job with is told.
    notifyLeadOfCoLeadAction({ actor: username, tags: functionTags, type: 'calendar_event', detail: newEvent.name })

    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    try {
      const res = await fetch(`${url}/rest/v1/calendar_events`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(newEvent),
      })
      if (!res.ok) {
        const body = await res.text()
        // The role column ships via supabase/calendar_event_role.sql; until
        // that's run, save the event untagged rather than failing outright.
        if (body.includes("'role' column")) {
          const { role: _dropped, ...withoutRole } = newEvent
          const retry = await fetch(`${url}/rest/v1/calendar_events`, {
            method: 'POST',
            headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify(withoutRole),
          })
          if (retry.ok) { scheduleReminder(newEvent); return }
        }
        console.error('Calendar insert failed:', res.status, body)
        addToast('Failed to save: ' + body, 'error')
        setEvents(prev => prev.filter(e => e.id !== newEvent.id))
      } else {
        scheduleReminder(newEvent)
      }
    } catch (err) {
      console.error('Calendar insert threw:', err)
      addToast('Failed to save event', 'error')
      setEvents(prev => prev.filter(e => e.id !== newEvent.id))
    }
  }

  const handleUpdate = async (id, payload, scope = 'all', instanceDate = null) => {
    const updates = {
      date_key: payload.date_key,
      name: payload.name,
      description: payload.description || '',
      event_type: payload.category,
      category: payload.category,
      priority: payload.priority || 'normal',
      department: payload.department || (CATEGORIES[payload.category]?.dept[0] || 'team'),
      start_time: payload.start_time || '',
      end_time: payload.end_time || '',
      location: payload.location || '',
      metadata: payload.metadata || {},
      recurrence: payload.recurrence || 'none',
      recurrence_until: payload.recurrence_until || '',
      assigned_to: payload.assigned_to || [],
    }

    setEditing(null)
    setOpenEvent(null)

    if (!canEditContent) {
      addToast('Only leads can edit events', 'error')
      return
    }

    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (scope === 'single' && instanceDate) {
      const parent = events.find(e => e.id === id)
      const detached = {
        ...updates,
        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date_key: instanceDate,
        recurrence: 'none',
        recurrence_until: '',
        exception_dates: [],
        added_by: parent?.added_by || username,
        series_id: id,
      }
      const newExceptions = [...new Set([...(parent?.exception_dates || []), instanceDate])]

      setEvents(prev => [
        ...prev.map(e => e.id === id ? { ...e, exception_dates: newExceptions } : e),
        detached,
      ])
      addToast('This occurrence updated', 'success')

      try {
        const r1 = await fetch(`${url}/rest/v1/calendar_events`, {
          method: 'POST',
          headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(detached),
        })
        if (!r1.ok) throw new Error(await r1.text())
        const r2 = await fetch(`${url}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ exception_dates: newExceptions }),
        })
        if (!r2.ok) throw new Error(await r2.text())
        scheduleReminder(detached)
      } catch (err) {
        console.error('Detach update failed:', err)
        addToast('Failed to save: ' + err.message, 'error')
      }
      return
    }

    const prevSnapshot = events.find(e => e.id === id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
    addToast('Event updated', 'success')

    try {
      const res = await fetch(`${url}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('Calendar update failed:', res.status, body)
        addToast('Failed to update: ' + body, 'error')
        if (prevSnapshot) setEvents(prev => prev.map(e => e.id === id ? prevSnapshot : e))
      } else {
        await cancelReminders(id)
        scheduleReminder({ ...prevSnapshot, ...updates, id })
      }
    } catch (err) {
      console.error('Calendar update threw:', err)
      addToast('Failed to update event', 'error')
      if (prevSnapshot) setEvents(prev => prev.map(e => e.id === id ? prevSnapshot : e))
    }
  }

  const handleDelete = async (id, scope = 'all', instanceDate = null) => {
    setOpenEvent(null)
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (scope === 'single' && instanceDate) {
      const parent = events.find(e => e.id === id)
      const newExceptions = [...new Set([...(parent?.exception_dates || []), instanceDate])]
      setEvents(prev => prev.map(e => e.id === id ? { ...e, exception_dates: newExceptions } : e))
      addToast('This occurrence removed', 'success')
      try {
        const res = await fetch(`${url}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ exception_dates: newExceptions }),
        })
        if (!res.ok) throw new Error(await res.text())
      } catch (err) {
        console.error('Single-occurrence delete failed:', err)
        addToast('Failed to remove occurrence', 'error')
      }
      return
    }

    const prevSnapshot = events
    setEvents(prev => prev.filter(e => e.id !== id))
    addToast('Event deleted', 'success')
    try {
      const res = await fetch(`${url}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: restHeaders(),
      })
      if (!res.ok) {
        console.error('Calendar delete failed:', res.status, await res.text())
        addToast('Failed to delete event', 'error')
        setEvents(prevSnapshot)
      } else {
        cancelReminders(id)
      }
    } catch (err) {
      console.error('Calendar delete threw:', err)
      addToast('Failed to delete event', 'error')
      setEvents(prevSnapshot)
    }
  }

  const handleReact = async (eventId, emoji) => {
    const existing = (reactions[eventId] || []).find(r => r.username === username && r.emoji === emoji)
    if (existing) {
      setReactions(prev => ({ ...prev, [eventId]: (prev[eventId] || []).filter(r => r.id !== existing.id) }))
      await supabase.from('calendar_birthday_reactions').delete().eq('id', existing.id)
      return
    }
    const row = {
      id: 'rx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      event_id: eventId,
      user_id: user?.id || null,
      username,
      emoji,
    }
    setReactions(prev => ({ ...prev, [eventId]: [...(prev[eventId] || []), { id: row.id, username, emoji }] }))
    await supabase.from('calendar_birthday_reactions').insert(stampStored(row))
  }

  const handleEventClick = (ev) => {
    if (ev.isTask) { onOpenTask?.(ev.task); return }
    setOpenEvent(ev)
  }



  // ---------------------------------------------------------------------- Header
  const headerLabel = useMemo(() => {
    if (view === 'month') return cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
    if (view === 'week') {
      const start = startOfWeek(cursor); const end = addDays(start, 6)
      return `${start.toLocaleString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    if (view === 'day') return cursor.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    return 'Next 60 days'
  }, [view, cursor])

  const shift = (dir) => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir))
    else if (view === 'day') setCursor(addDays(cursor, dir))
    else setCursor(addDays(cursor, 30 * dir))
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-20">
        {/* One row: title, date nav, both dropdowns, dashboard toggle, bell.
            Two rows made the sticky bar tall enough to eat the grid on a phone. */}
        <div className="pl-14 pr-3 sm:px-4 py-1.5 sm:ml-14 flex items-center gap-1.5 sm:gap-2 overflow-x-auto flex-nowrap [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent shrink-0">
            Calendar
          </h1>

          <div className="flex items-center gap-0.5 shrink-0 text-gray-200">
            <button onClick={() => shift(-1)} className="p-1 rounded-lg hover:bg-brand-blue/30"><ChevronLeft size={16} /></button>
            <button onClick={() => setCursor(new Date())} className="px-2 py-0.5 rounded-lg text-xs font-medium hover:bg-brand-blue/30">Today</button>
            <button onClick={() => shift(1)} className="p-1 rounded-lg hover:bg-brand-blue/30"><ChevronRight size={16} /></button>
          </div>

          {/* View switcher */}
          <div className="relative shrink-0 text-gray-200">
            <select
              value={view}
              onChange={e => setView(e.target.value)}
              className="appearance-none pl-2.5 pr-7 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-100 border border-transparent hover:bg-gray-200 transition-colors cursor-pointer"
            >
              {VIEWS.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>

          {/* Department filter — keeps the gradient while a filter is on. */}
          <div className="relative shrink-0 text-gray-200">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className={`appearance-none pl-2.5 pr-7 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-gray-800 text-gray-100 border-transparent hover:bg-gray-200'
                  : 'bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark text-white border-transparent shadow-sm'
              }`}
            >
              {departments.map(d => (
                <option key={d.id} value={d.id} className="text-gray-100 bg-white font-medium">
                  {d.emoji} {d.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${filter === 'all' ? 'text-gray-400' : 'text-white'}`}
            />
          </div>

          <div className="ml-auto shrink-0 text-gray-200">
            <NotificationBell />
          </div>
        </div>
      </header>

      <main className="flex-1 p-1.5 sm:p-4 overflow-auto">
        {/* Month and year, large, above the grid — the small label that used
            to sit next to Today lived in the header and was easy to miss. */}
        <h2
          className="text-4xl sm:text-5xl text-gray-700 text-center mb-3 mt-1 leading-none"
          style={{ fontFamily: "'Kalam', cursive" }}
        >
          {/* Week and day views keep their range here, so removing the small
              label next to Today doesn't lose what you're looking at. */}
          {view === 'month' ? cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' }) : headerLabel}
        </h2>

        {view === 'month'  && <MonthView  cursor={cursor} eventsByDay={eventsByDay} onEventClick={handleEventClick} onDayClick={(k) => setSelectedDay(k)} canCreate={!isGuest} onCreate={(k) => setCreating({ date_key: k })} reactions={reactions} />}
        {view === 'week'   && <WeekView   cursor={cursor} eventsByDay={eventsByDay} onEventClick={handleEventClick} canCreate={!isGuest} onCreate={(k) => setCreating({ date_key: k })} reactions={reactions} />}
        {view === 'day'    && <DayView    cursor={cursor} eventsByDay={eventsByDay} onEventClick={handleEventClick} canCreate={!isGuest} onCreate={(k) => setCreating({ date_key: k })} reactions={reactions} />}
        {view === 'agenda' && <AgendaView cursor={cursor} eventsByDay={eventsByDay} onEventClick={handleEventClick} reactions={reactions} />}

        {selectedDay && view === 'month' && (
          <DayPanel
            dateKey={selectedDay}
            items={eventsByDay[selectedDay] || []}
            onClose={() => setSelectedDay(null)}
            onEventClick={handleEventClick}
            onCreate={() => setCreating({ date_key: selectedDay })}
            canCreate={!isGuest}
          />
        )}

        {/* Dashboard sits under the calendar — the grid is the reason you
            opened this tab, so it shouldn't be pushed down the page. */}
        {showDashboard ? (
          <div className="mt-4">
            <Dashboard
              events={events}
              taskEvents={taskEvents}
              username={username}
              onOpenEvent={setOpenEvent}
              onOpenTask={onOpenTask}
              onToggle={() => setShowDashboard(false)}
            />
          </div>
        ) : (
          // Collapsed: the arrow stays in the same spot so it's where you left it.
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowDashboard(true)}
              title="Show dashboard"
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        )}
      </main>


      {/* Test notification — Kayden only. Sending to everyone is how we check at
          a meeting who still hasn't switched notifications on. */}

      {openEvent && (
        <EventModal
          event={openEvent}
          onClose={() => setOpenEvent(null)}
          onDelete={canEditContent ? handleDelete : null}
          onEdit={canEditContent ? () => {
            const isRecurring = openEvent.recurrence && openEvent.recurrence !== 'none'
            let scope = 'all'
            if (isRecurring) {
              const pickSingle = confirm(
                'This is a recurring event.\n\nOK — edit just THIS date only\nCancel — edit the whole series'
              )
              scope = pickSingle ? 'single' : 'all'
            }
            setEditing({ ...openEvent, _editScope: scope, _instanceDate: openEvent.date_key })
            setOpenEvent(null)
          } : null}
          reactions={reactions[openEvent.id] || []}
          onReact={(emoji) => handleReact(openEvent.id, emoji)}
          username={username}
        />
      )}

      {creating && (
        <EventForm
          dateKey={creating.date_key}
          onClose={() => setCreating(null)}
          onSubmit={handleCreate}
          canEdit={canEditContent}
          departments={departments}
        />
      )}

      {editing && (
        <EventForm
          dateKey={editing.date_key}
          existing={editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => handleUpdate(editing.id, payload, editing._editScope || 'all', editing._instanceDate || null)}
          canEdit={canEditContent}
          departments={departments}
        />
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({ events, taskEvents, username, onOpenEvent, onOpenTask, onToggle }) {
  const today = new Date()
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 6)
  const todayKey = toKey(today)
  const weekEndKey = toKey(weekEnd)

  const all = useMemo(() => {
    const list = []
    events.forEach(ev => {
      const keys = expandRecurrence(ev, weekStart, weekEnd)
      keys.forEach(k => list.push({ ...ev, date_key: k }))
    })
    return list
      .filter(e => e.date_key >= todayKey && e.date_key <= weekEndKey)
      .sort((a, b) => (a.date_key + (a.start_time || '')).localeCompare(b.date_key + (b.start_time || '')))
  }, [events, todayKey, weekEndKey]) // eslint-disable-line

  const upcoming = all.slice(0, 4)
  const dueSoon = useMemo(() => taskEvents
    .filter(t => t.date_key >= todayKey && t.date_key <= weekEndKey && (t.assignee || '').toLowerCase() === (username || '').toLowerCase() && t.status !== 'done' && t.status !== 'completed')
    .sort((a, b) => a.date_key.localeCompare(b.date_key))
    .slice(0, 4), [taskEvents, username, todayKey, weekEndKey])
  const birthdays = all.filter(e => e.category === 'birthday').slice(0, 3)
  const nextComp = all.find(e => e.category === 'competition')

  const Card = ({ title, children, accent, action }) => (
    <div className="bg-white/80 rounded-xl p-3 border border-gray-100 min-w-0">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {action && <div className="ml-auto -mr-1">{action}</div>}
      </div>
      {children}
    </div>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <Card title="This Week" accent="#3b82f6">
        {upcoming.length === 0 ? <p className="text-xs text-gray-400">Nothing scheduled this week.</p> : (
          <ul className="space-y-1">
            {upcoming.map(e => (
              <li key={e.id + e.date_key} onClick={() => onOpenEvent(e)} className="text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 truncate">
                <span className="mr-1">{CATEGORIES[e.category]?.emoji || '📅'}</span>
                <span className="font-medium text-gray-700">{e.name}</span>
                <span className="text-gray-400"> · {formatHuman(fromKey(e.date_key))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Due This Week" accent="#f97316">
        {dueSoon.length === 0 ? <p className="text-xs text-gray-400">Nothing due this week.</p> : (
          <ul className="space-y-1">
            {dueSoon.map(t => (
              <li key={t.id} onClick={() => onOpenTask?.(t.task)} className="text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5" style={{ background: TASK_PRIORITY_COLOR[t.priority] || '#9ca3af' }} />
                <span className="font-medium text-gray-700">{t.name}</span>
                <span className="text-gray-400"> · {formatHuman(fromKey(t.date_key))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Birthdays This Week" accent="#ec4899">
        {birthdays.length === 0 ? <p className="text-xs text-gray-400">No birthdays this week.</p> : (
          <ul className="space-y-1">
            {birthdays.map(b => (
              <li key={b.id + b.date_key} onClick={() => onOpenEvent(b)} className="text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 truncate">
                🎂 <span className="font-medium text-gray-700">{b.name}</span>
                <span className="text-gray-400"> · {formatHuman(fromKey(b.date_key))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card
        title="Competition This Week"
        accent="#ef4444"
        action={onToggle && (
          <button
            onClick={onToggle}
            title="Hide dashboard"
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <ChevronUp size={16} />
          </button>
        )}
      >
        {!nextComp ? <p className="text-xs text-gray-400">None this week.</p> : (
          <div onClick={() => onOpenEvent(nextComp)} className="cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
            <p className="text-sm font-semibold text-gray-700 truncate">🏆 {nextComp.name}</p>
            <p className="text-xs text-gray-500">{formatHuman(fromKey(nextComp.date_key))}{nextComp.location ? ` · ${nextComp.location}` : ''}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event bubble (the rounded pill shown inside day cells / lists)
// ---------------------------------------------------------------------------
// Category (or task-status) color for the mobile month-view dots.
function eventDotColor(ev) {
  if (ev.isTask) {
    const isDone = ev.status === 'done' || ev.status === 'completed'
    return isDone ? '#22c55e' : (TASK_PRIORITY_COLOR[ev.priority] || '#9ca3af')
  }
  const cat = CATEGORIES[ev.category] || CATEGORIES[ev.event_type] || CATEGORIES.meeting
  return cat.color
}

function EventBubble({ ev, onClick, dense = false }) {
  if (ev.isTask) {
    const isDone = ev.status === 'done' || ev.status === 'completed'
    const color = isDone ? '#22c55e' : (TASK_PRIORITY_COLOR[ev.priority] || '#9ca3af')
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(ev) }}
        className={`group w-full text-left rounded-full ${dense ? 'px-1.5 py-0.5' : 'px-2 py-1'} hover:opacity-90 transition-opacity flex items-center gap-1 truncate`}
        style={{ background: color + '22', borderLeft: `3px solid ${color}` }}
        title={`Task: ${ev.name}${ev.assignee ? ' · ' + ev.assignee : ''}`}
      >
        <span className={`text-[10px] font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-700'}`}>📋 {ev.name}</span>
      </button>
    )
  }
  const cat = CATEGORIES[ev.category] || CATEGORIES[ev.event_type] || CATEGORIES.meeting
  const prio = PRIORITIES[ev.priority] || PRIORITIES.normal
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(ev) }}
      className={`group w-full text-left rounded-full ${dense ? 'px-1.5 py-0.5' : 'px-2 py-1'} hover:opacity-90 transition-opacity flex items-center gap-1 truncate`}
      style={{
        background: cat.soft,
        color: cat.text,
        boxShadow: prio.ring !== 'transparent' ? `inset 3px 0 0 ${prio.ring}` : undefined,
      }}
      title={ev.description || ev.name}
    >
      <span className="text-[10px]">{cat.emoji}</span>
      <span className="text-[10px] font-medium truncate flex-1">{ev.name}</span>
      {ev.recurrence && ev.recurrence !== 'none' && <Repeat size={9} className="opacity-60 shrink-0" />}
      {ev.priority === 'critical' && <AlertCircle size={9} className="text-red-500 shrink-0" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------
function MonthView({ cursor, eventsByDay, onEventClick, onDayClick, canCreate, onCreate }) {
  const year = cursor.getFullYear(), month = cursor.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
        {dayNames.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={'e' + i} className="min-h-[52px] sm:min-h-[110px] rounded-lg bg-gray-50/50" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const date = new Date(year, month, day)
          const key = toKey(date)
          const items = eventsByDay[key] || []
          const isToday = sameDay(date, today)
          return (
            <div
              key={day}
              onClick={() => onDayClick(key)}
              className={`min-h-[52px] sm:min-h-[110px] rounded-lg p-1 sm:p-1.5 cursor-pointer transition-colors border bg-white/50 hover:bg-white/90 ${isToday ? 'border-brand-blue-dark/50' : 'border-transparent'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isToday ? 'bg-brand-blue-dark text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-gray-700'}`}>{day}</span>
                {canCreate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCreate(key) }}
                    className="hidden sm:block p-0.5 rounded hover:bg-gray-100"
                    title="Add event"
                  >
                    <Plus size={11} className="text-gray-400" />
                  </button>
                )}
              </div>
              {/* Phones: colored dots (tap the day for details via the day
                  panel). sm+ keeps the full chips. */}
              <div className="flex sm:hidden flex-wrap gap-[3px] mt-0.5">
                {items.slice(0, 6).map((ev, idx) => (
                  <span
                    key={ev.id + ':' + idx}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: eventDotColor(ev) }}
                  />
                ))}
                {items.length > 6 && <span className="text-[8px] leading-none text-gray-400">+{items.length - 6}</span>}
              </div>
              <div className="hidden sm:block space-y-0.5 max-h-[80px] overflow-y-auto pr-0.5">
                {items.map((ev, idx) => (
                  <EventBubble key={ev.id + ':' + idx} ev={ev} onClick={onEventClick} dense />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------
function WeekView({ cursor, eventsByDay, onEventClick, canCreate, onCreate }) {
  const start = startOfWeek(cursor)
  const today = new Date()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {Array.from({ length: 7 }).map((_, i) => {
        const d = addDays(start, i)
        const key = toKey(d)
        const items = eventsByDay[key] || []
        const isToday = sameDay(d, today)
        return (
          <div key={key} className={`bg-white/70 rounded-xl p-2 sm:min-h-[60vh] border ${isToday ? 'border-brand-blue-dark/40' : 'border-gray-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs text-gray-500 uppercase">{d.toLocaleString(undefined, { weekday: 'short' })}</p>
                <p className={`text-lg font-bold ${isToday ? 'text-brand-blue-dark' : 'text-gray-700'}`}>{d.getDate()}</p>
              </div>
              {canCreate && (
                <button onClick={() => onCreate(key)} className="p-1 rounded hover:bg-gray-100"><Plus size={14} /></button>
              )}
            </div>
            <div className="space-y-1">
              {items.length === 0 ? <p className="text-xs text-gray-300">—</p> : items.map((ev, idx) => (
                <div key={ev.id + ':' + idx}>
                  <EventBubble ev={ev} onClick={onEventClick} />
                  {ev.start_time && <p className="text-[10px] text-gray-400 ml-2 mt-0.5">{formatTime(ev.start_time)}</p>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day view
// ---------------------------------------------------------------------------
function DayView({ cursor, eventsByDay, onEventClick, canCreate, onCreate }) {
  const key = toKey(cursor)
  const items = eventsByDay[key] || []
  const timed = items.filter(e => !e.isTask && e.start_time)
  const allDay = items.filter(e => !e.isTask && !e.start_time)
  const tasks = items.filter(e => e.isTask)

  return (
    <div className="max-w-3xl mx-auto bg-white/80 rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-700">{cursor.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        {canCreate && (
          <button onClick={() => onCreate(key)} className="text-xs px-2.5 py-1 rounded-full bg-brand-blue text-brand-blue-dark hover:bg-brand-blue-dark hover:text-white">
            <Plus size={12} className="inline mr-1" />Add Event
          </button>
        )}
      </div>
      {items.length === 0 && <p className="text-sm text-gray-400 italic">No events scheduled.</p>}

      {allDay.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-2">All-day</p>
          <div className="space-y-1.5">{allDay.map((e, i) => <EventBubble key={e.id + i} ev={e} onClick={onEventClick} />)}</div>
        </div>
      )}

      {timed.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Schedule</p>
          <div className="space-y-2">
            {timed.map((e, i) => (
              <div key={e.id + i} className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-500 w-20 shrink-0">{formatTime(e.start_time)}{e.end_time ? `–${formatTime(e.end_time)}` : ''}</span>
                <div className="flex-1"><EventBubble ev={e} onClick={onEventClick} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Tasks Due</p>
          <div className="space-y-1.5">{tasks.map((e, i) => <EventBubble key={e.id + i} ev={e} onClick={onEventClick} />)}</div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agenda view
// ---------------------------------------------------------------------------
function AgendaView({ cursor, eventsByDay, onEventClick }) {
  const days = []
  for (let i = 0; i <= 60; i++) {
    const d = addDays(cursor, i)
    const k = toKey(d)
    const items = eventsByDay[k] || []
    if (items.length > 0) days.push({ date: d, key: k, items })
  }
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {days.length === 0 && <p className="text-sm text-gray-400 italic">Nothing scheduled in the next 60 days.</p>}
      {days.map(d => (
        <div key={d.key} className="bg-white/80 rounded-xl border border-gray-100 p-3">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-2">{formatHuman(d.date)}</p>
          <div className="space-y-1.5">
            {d.items.map((ev, i) => (
              <div key={ev.id + i} className="flex items-center gap-2">
                {ev.start_time && <span className="text-[11px] font-mono text-gray-400 w-16 shrink-0">{formatTime(ev.start_time)}</span>}
                <div className="flex-1 min-w-0"><EventBubble ev={ev} onClick={onEventClick} /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day panel (pop-out under month grid)
// ---------------------------------------------------------------------------
function DayPanel({ dateKey, items, onClose, onEventClick, onCreate, canCreate }) {
  const date = fromKey(dateKey)
  return (
    <div className="mt-4 max-w-lg mx-auto bg-white/90 rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{date.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        <div className="flex items-center gap-1">
          {canCreate && <button onClick={onCreate} className="p-1 rounded hover:bg-gray-100"><Plus size={14} className="text-gray-500" /></button>}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={14} className="text-gray-400" /></button>
        </div>
      </div>
      {items.length === 0 ? <p className="text-xs text-gray-400">Nothing on this day.</p> : (
        <div className="space-y-1.5">{items.map((ev, i) => <EventBubble key={ev.id + i} ev={ev} onClick={onEventClick} />)}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event detail modal (square overlay)
// ---------------------------------------------------------------------------
function EventModal({ event, onClose, onDelete, onEdit, reactions, onReact, username }) {
  const cat = CATEGORIES[event.category] || CATEGORIES[event.event_type] || CATEGORIES.meeting
  const prio = PRIORITIES[event.priority] || PRIORITIES.normal
  const meta = event.metadata || {}
  const date = fromKey(event.date_key)

  const Field = ({ label, value }) => value ? (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{value}</p>
    </div>
  ) : null

  // Group reactions by emoji for compact display
  const grouped = {}
  reactions.forEach(r => { (grouped[r.emoji] = grouped[r.emoji] || []).push(r.username) })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTop: `4px solid ${cat.color}` }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl">{cat.emoji}</span>
              <div>
                <h2 className="text-lg font-bold text-gray-800 leading-tight">{event.name}</h2>
                <p className="text-xs text-gray-500">{cat.label}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${prio.badge}`}>{prio.label}</span>
            {event.department && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{event.department}</span>}
            {event.recurrence && event.recurrence !== 'none' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                <Repeat size={10} /> {event.recurrence}
              </span>
            )}
          </div>

          {/* Common fields */}
          <div className="space-y-3">
            <Field label="Date" value={date.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} />
            {(event.start_time || event.end_time) && (
              <Field label="Time" value={`${formatTime(event.start_time)}${event.end_time ? ' – ' + formatTime(event.end_time) : ''}`} />
            )}
            <Field label="Location" value={event.location} />
            <Field label="Description" value={event.description} />

            {/* Category-specific fields */}
            {event.category === 'meeting' && <Field label="Agenda" value={meta.agenda} />}
            {event.category === 'meeting' && <Field label="Notes" value={meta.notes} />}

            {event.category === 'competition' && (
              <>
                <Field label="Match Schedule" value={meta.match_schedule} />
                <Field label="Assigned Roles" value={meta.roles} />
                <Field label="What to Wear" value={meta.dress_code} />
              </>
            )}

            {event.category === 'outreach' && (
              <>
                <Field label="Hours" value={meta.hours} />
                <Field label="What to Bring" value={meta.what_to_bring} />
              </>
            )}

            {event.category === 'workshop' && (
              <>
                <Field label="Topic" value={meta.topic} />
                <Field label="Instructor" value={meta.instructor} />
                <Field label="Materials Needed" value={meta.materials} />
              </>
            )}

            {event.category === 'fundraising' && (
              <Field label="Fundraising Goal" value={meta.goal} />
            )}

            {event.category === 'birthday' && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Send a reaction</p>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {REACTION_EMOJIS.map(emoji => {
                    const mine = (grouped[emoji] || []).includes(username)
                    return (
                      <button
                        key={emoji}
                        onClick={() => onReact(emoji)}
                        className={`text-2xl rounded-full w-11 h-11 flex items-center justify-center transition-all hover:scale-110 ${mine ? 'bg-brand-yellow/30 ring-2 ring-brand-yellow-dark' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        {emoji}
                      </button>
                    )
                  })}
                </div>
                {Object.keys(grouped).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(grouped).map(([emoji, names]) => (
                      <p key={emoji} className="text-xs text-gray-600">
                        <span className="text-base mr-1">{emoji}</span>
                        <span className="text-gray-500">{names.join(', ')}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {event.assigned_to && event.assigned_to.length > 0 && (
              <Field label="Assigned" value={event.assigned_to.join(', ')} />
            )}
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-gray-100 gap-3">
            <p className="text-[11px] text-gray-400 flex-1 truncate">Added by {event.added_by}</p>
            <div className="flex items-center gap-2 shrink-0">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-blue/40 hover:bg-brand-blue text-gray-700 transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    const isRecurring = event.recurrence && event.recurrence !== 'none'
                    if (isRecurring) {
                      const pickSingle = confirm(
                        'This is a recurring event.\n\nOK — delete just THIS date only\nCancel — ask about the whole series'
                      )
                      if (pickSingle) {
                        onDelete(event.id, 'single', event.date_key)
                      } else if (confirm('Delete the ENTIRE recurring series?')) {
                        onDelete(event.id, 'all')
                      }
                    } else if (confirm('Delete this event?')) {
                      onDelete(event.id, 'all')
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event form (handles both create and edit)
// ---------------------------------------------------------------------------
function EventForm({ dateKey, existing, onClose, onSubmit, canEdit, departments = [] }) {
  const isEdit = !!existing
  const [date, setDate]               = useState(existing?.date_key || dateKey)
  const [category, setCategory]       = useState(existing?.category || existing?.event_type || 'meeting')
  const [name, setName]               = useState(existing?.name || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [priority, setPriority]       = useState(existing?.priority || 'normal')
  const [department, setDepartment]   = useState(existing?.department || 'team')
  // Meetings run 4–8 after school and 9–2 on Saturdays, so the default follows
  // the day the event lands on. Every other category keeps the 4–8 PM default.
  const WEEKEND_HOURS = { start: '09:00', end: '14:00' }
  const WEEKDAY_HOURS = { start: '16:00', end: '20:00' }
  const hoursForDate = (key) => {
    const day = fromKey(key || dateKey).getDay()
    return (day === 0 || day === 6) ? WEEKEND_HOURS : WEEKDAY_HOURS
  }
  const initialHours = hoursForDate(existing?.date_key || dateKey)
  const [startTime, setStartTime]     = useState(existing ? (existing.start_time || '') : initialHours.start)
  const [endTime, setEndTime]         = useState(existing ? (existing.end_time || '') : initialHours.end)
  const timesTouched = useRef(false)
  // Re-runs when the date changes too, so moving an event to a Saturday moves
  // its hours with it — unless the times were set by hand.
  useEffect(() => {
    if (isEdit || timesTouched.current) return
    if (category === 'meeting') {
      const h = hoursForDate(date)
      setStartTime(h.start); setEndTime(h.end)
    } else {
      setStartTime(WEEKDAY_HOURS.start); setEndTime(WEEKDAY_HOURS.end)
    }
  }, [category, date]) // eslint-disable-line
  const [location, setLocation]       = useState(existing?.location || '')
  const [recurrence, setRecurrence]   = useState(existing?.recurrence || 'none')
  const [recurrenceUntil, setRecurrenceUntil] = useState(existing?.recurrence_until || '')
  const [meta, setMeta]               = useState(existing?.metadata || {})

  // Sync department default with category — but only on category change, not on mount
  // (so an existing event's department isn't overridden when the form opens).
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const cat = CATEGORIES[category]
    if (cat && !cat.dept.includes(department)) setDepartment(cat.dept[0])
  }, [category]) // eslint-disable-line

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      date_key: date,
      name: name.trim(),
      description: description.trim(),
      category,
      priority,
      department,
      start_time: startTime,
      end_time: endTime,
      location: location.trim(),
      recurrence,
      recurrence_until: recurrenceUntil,
      metadata: meta,
    })
  }

  const setMetaField = (k, v) => setMeta(prev => ({ ...prev, [k]: v }))
  const cat = CATEGORIES[category]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTop: `4px solid ${cat.color}` }}
      >
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">
              {isEdit ? 'Edit Event' : (canEdit ? 'New Event' : 'Request Event')}
            </h2>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
          </div>
          <p className="text-xs text-gray-500">{formatHuman(fromKey(date))}{!canEdit && !isEdit && ' · A lead will review your request.'}</p>

          {isEdit && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg text-xs mt-1" />
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Category</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${category === key ? '' : 'opacity-60 hover:opacity-100'}`}
                  style={{ background: c.soft, color: c.text }}
                >
                  <span>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          {category === 'finance' && (
            <div className="flex flex-wrap gap-1">
              {FINANCE_DEADLINES.map(d => (
                <button
                  key={d} type="button" onClick={() => setName(d)}
                  className={`text-[11px] px-2 py-1 rounded-full transition-colors ${name === d ? 'bg-yellow-200 text-yellow-800 font-semibold' : 'bg-gray-100 text-gray-500 hover:bg-yellow-100'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={category === 'birthday' ? 'Whose birthday?' : category === 'finance' ? 'Deadline (or pick above)' : 'Event title'}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Start time</label>
              <input type="time" value={startTime} onChange={(e) => { timesTouched.current = true; setStartTime(e.target.value) }} className="w-full px-2 py-1.5 border rounded-lg text-xs mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">End time</label>
              <input type="time" value={endTime} onChange={(e) => { timesTouched.current = true; setEndTime(e.target.value) }} className="w-full px-2 py-1.5 border rounded-lg text-xs mt-1" />
            </div>
          </div>

          {category !== 'birthday' && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this?" className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Notes</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description"
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1 resize-none" />
          </div>

          {/* Category-specific extras */}
          {category === 'meeting' && (
            <CatField label="Agenda" value={meta.agenda || ''} onChange={(v) => setMetaField('agenda', v)} multiline />
          )}
          {category === 'competition' && (
            <>
              <CatField label="Match Schedule" value={meta.match_schedule || ''} onChange={(v) => setMetaField('match_schedule', v)} multiline />
              <CatField label="Assigned Roles" value={meta.roles || ''} onChange={(v) => setMetaField('roles', v)} />
              <CatField label="What to Wear" value={meta.dress_code || ''} onChange={(v) => setMetaField('dress_code', v)} />
            </>
          )}
          {category === 'outreach' && (
            <>
              <CatField label="Hours" value={meta.hours || ''} onChange={(v) => setMetaField('hours', v)} />
              <CatField label="What to Bring" value={meta.what_to_bring || ''} onChange={(v) => setMetaField('what_to_bring', v)} />
            </>
          )}
          {category === 'workshop' && (
            <>
              <CatField label="Topic" value={meta.topic || ''} onChange={(v) => setMetaField('topic', v)} />
              <CatField label="Instructor" value={meta.instructor || ''} onChange={(v) => setMetaField('instructor', v)} />
              <CatField label="Materials Needed" value={meta.materials || ''} onChange={(v) => setMetaField('materials', v)} multiline />
            </>
          )}
          {category === 'fundraising' && (
            <CatField label="Fundraising Goal" value={meta.goal || ''} onChange={(v) => setMetaField('goal', v)} />
          )}

          {/* Priority + Department */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg text-xs mt-1">
                <option value="normal">🟢 Normal</option>
                <option value="important">🟡 Important</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-2 py-1.5 border rounded-lg text-xs mt-1">
                {/* Same list as the filter, minus the two that aren't places. */}
                {departments.filter(d => d.id !== 'all' && d.id !== 'mine').map(d => (
                  <option key={d.id} value={d.id}>{d.emoji} {d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reminder */}
          <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!(meta.reminder?.disabled)}
                onChange={(e) => setMeta(prev => ({ ...prev, reminder: { ...(prev.reminder || {}), disabled: !e.target.checked } }))}
                className="rounded border-gray-300 text-brand-blue-dark focus:ring-brand-blue"
              />
              <span className="text-xs font-medium text-gray-700">Send reminder notification</span>
            </label>
            {!(meta.reminder?.disabled) && (
              <>
                {startTime ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0">Remind</span>
                    <select
                      value={meta.reminder?.minutes_before ?? 60}
                      onChange={(e) => setMeta(prev => ({ ...prev, reminder: { ...(prev.reminder || {}), minutes_before: Number(e.target.value) } }))}
                      className="flex-1 px-2 py-1 border rounded text-xs"
                    >
                      <option value={0}>at start time</option>
                      <option value={5}>5 min before</option>
                      <option value={15}>15 min before</option>
                      <option value={30}>30 min before</option>
                      <option value={60}>1 hour before</option>
                      <option value={120}>2 hours before</option>
                      <option value={1440}>1 day before</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Reminder will fire at 8:00 AM on the day.</p>
                )}
                <input
                  type="text"
                  value={meta.reminder?.message || ''}
                  onChange={(e) => setMeta(prev => ({ ...prev, reminder: { ...(prev.reminder || {}), message: e.target.value } }))}
                  placeholder="Custom message (optional)"
                  className="w-full px-2 py-1.5 border rounded-lg text-xs"
                />
              </>
            )}
          </div>

          {/* Repeat controls removed from the form by request. Existing recurring
              events still render and expand — recurrence state just carries the
              event's saved value through edits unchanged. */}
          <button type="submit" disabled={!name.trim()}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40`}
            style={{ background: cat.color }}
          >
            {isEdit ? 'Save Changes' : (canEdit ? 'Create Event' : 'Submit Request')}
          </button>
        </div>
      </form>
    </div>
  )
}

function CatField({ label, value, onChange, multiline }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
          className="w-full px-3 py-2 border rounded-lg text-sm mt-1 resize-none" />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
      )}
    </div>
  )
}

export default CalendarView
