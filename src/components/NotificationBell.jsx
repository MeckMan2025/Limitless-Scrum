import { useState, useEffect, useRef } from 'react'
import { useFeatures } from '../lib/features'
import { restHeaders, ensureUserToken } from '../lib/restHeaders'
import { createPortal } from 'react-dom'
import { Bell, Inbox, Megaphone, HelpCircle, CheckCheck, Trash2 } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import NotificationPopup from './NotificationPopup'
import { useRequestsPanel } from '../hooks/useRequestsPanel'
import { useAnnouncementsPanel } from '../hooks/useAnnouncementsPanel'
import { useIdeasPanel } from '../hooks/useIdeasPanel'
import { usePermissions } from '../hooks/usePermissions'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Shared across every mounted bell so an incoming notification only pops once.
const poppedIds = new Set()

// Ask for OS notification permission (best-effort; ignored if already decided).
function requestNotifPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  } catch { /* ignore */ }
}

export default function NotificationBell() {
  // Switched off in Settings: no bell at all (the hooks below still run, so
  // the hook order stays the same either way).
  const feat = useFeatures()
  const { user } = useUser()
  const { pendingCount, panel: requestsPanel } = useRequestsPanel()
  const { freshCount, panel: announcementsPanel } = useAnnouncementsPanel()
  const { isCofounder } = usePermissions()
  const { ideaCount, panel: ideasPanel } = useIdeasPanel(isCofounder)
  // Which list the panel body shows: notifications by default, or one of the
  // header icons' views. Only one can be active.
  const [view, setView] = useState('notifications')
  const showRequests = view === 'requests'
  const showAnnouncements = view === 'announcements'
  const showIdeas = view === 'ideas'
  const setShowRequests = (fnOrVal) => setView(v => (typeof fnOrVal === 'function' ? fnOrVal(v === 'requests') : fnOrVal) ? 'requests' : 'notifications')
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const [anchor, setAnchor] = useState(null)
  const [popup, setPopup] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const unreadCount = notifications.filter(n => !n.read).length



  // Ask for OS notification permission once so real notifications can fire.
  useEffect(() => { requestNotifPermission() }, [])

  // Load notifications via direct REST (bypasses JS client auth token issues)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      // Wait for the user's token: as the public key this list is empty.
      await ensureUserToken()
      const res = await fetch(
        `${supabaseUrl}/rest/v1/notifications?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=20`,
        { headers: restHeaders() }
      )
      if (res.ok && !cancelled) setNotifications(await res.json())
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // Realtime subscription
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => {
          if (prev.some(n => n.id === payload.new.id)) return prev
          return [payload.new, ...prev].slice(0, 20)
        })
        // Pop it on screen once (cute white card + OS notification)
        if (!poppedIds.has(payload.new.id)) {
          poppedIds.add(payload.new.id)
          setPopup(payload.new)
          // Foreground OS notification if permission granted
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(payload.new.title || 'Notification', {
                body: payload.new.body || '',
                icon: '/icon-192.png',
              })
            } catch (e) {
              // Ignore — may fail on mobile or if SW is handling it
            }
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  // Close on outside click
  useEffect(() => {
    function onClick(e) {
      const inTrigger = ref.current && ref.current.contains(e.target)
      const inPanel = panelRef.current && panelRef.current.contains(e.target)
      if (!inTrigger && !inPanel) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Read, all read, clear: the screen changes at once and the database is
  // told with the user's token. These used to call the lazy headers object
  // as a function, which threw before the request left — so a notification
  // looked read until the next load brought it back unread.
  const markAsRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    try {
      await ensureUserToken()
      const res = await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${id}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ read: true }),
      })
      if (!res.ok) console.error('[Notifications] mark read failed:', res.status, await res.text())
    } catch (err) { console.error('[Notifications] mark read failed:', err) }
  }

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read)
    if (unread.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    try {
      await ensureUserToken()
      const res = await fetch(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${user.id}&read=eq.false`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ read: true }),
      })
      if (!res.ok) console.error('[Notifications] mark all read failed:', res.status, await res.text())
    } catch (err) { console.error('[Notifications] mark all read failed:', err) }
  }

  const clearAll = async () => {
    if (notifications.length === 0) return
    setNotifications([])
    try {
      await ensureUserToken()
      const res = await fetch(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${user.id}`, {
        method: 'DELETE',
        headers: restHeaders(),
      })
      if (!res.ok) console.error('[Notifications] clear failed:', res.status, await res.text())
    } catch (err) { console.error('[Notifications] clear failed:', err) }
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  if (!feat.notifications) return null
  return (
    <div className="relative" ref={ref}>
      <NotificationPopup notification={popup} onClose={() => setPopup(null)} />
      <button
        ref={btnRef}
        onClick={() => {
          requestNotifPermission()
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
          setOpen(prev => !prev)
        }}
        className="relative p-2 rounded-lg hover:bg-brand-blue/30 transition-colors"
        title="Notifications"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Mobile backdrop — blurs background, click to close */}
          <div
            className="sm:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-[100]"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            style={anchor ? { '--anchor-top': `${anchor.top}px`, '--anchor-right': `${anchor.right}px` } : undefined}
            className="
              fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md max-h-[80vh]
              sm:left-auto sm:translate-x-0 sm:translate-y-0 sm:w-80 sm:max-h-96
              sm:top-[var(--anchor-top)] sm:right-[var(--anchor-right)]
              overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-200 z-[101]
            ">
          <div className="px-3 pt-2 pb-2 border-b border-gray-100 sticky top-0 bg-white">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 text-center mb-1.5">Notifications</h3>
            <div className="flex items-center justify-center gap-1.5">
              {/* One icon per view — bell (notifications), requests,
                  announcements, ideas. Outlined when idle, filled when active. */}
              <button
                onClick={() => setView('notifications')}
                title="Notifications"
                className={`relative p-1 rounded-lg border transition-colors ${
                  view === 'notifications'
                    ? 'bg-brand-blue-dark border-brand-blue-dark'
                    : 'border-brand-blue-dark/50 hover:bg-brand-blue/20'
                }`}
              >
                <Bell size={14} className={view === 'notifications' ? 'text-white' : 'text-brand-blue-dark'} />
                {unreadCount > 0 && view !== 'notifications' && (
                  <span className="absolute -top-1 -right-1 bg-brand-blue-dark text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowRequests(v => !v)}
                title={showRequests ? 'Back to notifications' : 'Requests'}
                className={`relative p-1 rounded-lg border transition-colors ${
                  showRequests
                    ? 'bg-brand-yellow-dark border-brand-yellow-dark'
                    : 'border-brand-yellow-dark/50 hover:bg-brand-yellow/20'
                }`}
              >
                <Inbox size={14} className={showRequests ? 'text-white' : 'text-brand-yellow-dark'} />
                {pendingCount > 0 && !showRequests && (
                  <span className="absolute -top-1 -right-1 bg-brand-yellow-dark text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setView(v => v === 'announcements' ? 'notifications' : 'announcements')}
                title={showAnnouncements ? 'Back to notifications' : 'Announcements'}
                className={`relative p-1 rounded-lg border transition-colors ${
                  showAnnouncements
                    ? 'bg-brand-silver-dark border-brand-silver-dark'
                    : 'border-brand-silver-dark/50 hover:bg-brand-silver/20'
                }`}
              >
                <Megaphone size={14} className={showAnnouncements ? 'text-white' : 'text-brand-silver-dark'} />
                {freshCount > 0 && !showAnnouncements && (
                  <span className="absolute -top-1 -right-1 bg-brand-silver-dark text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {freshCount}
                  </span>
                )}
              </button>
              {/* Ideas pitched from under-construction pages — everyone can look
                  and thumbs-up; co-founders review inside the panel. */}
              {(
                <button
                  onClick={() => setView(v => v === 'ideas' ? 'notifications' : 'ideas')}
                  title={showIdeas ? 'Back to notifications' : 'Ideas & suggestions'}
                  className={`relative p-1 rounded-lg border transition-colors ${
                    showIdeas
                      ? 'bg-brand-blue-dark border-brand-blue-dark'
                      : 'border-brand-blue-dark/50 hover:bg-brand-blue/20'
                  }`}
                >
                  <HelpCircle size={14} className={showIdeas ? 'text-white' : 'text-brand-blue-dark'} />
                  {ideaCount > 0 && !showIdeas && (
                    <span className="absolute -top-1 -right-1 bg-brand-blue-dark text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                      {ideaCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Actions live under the tabs on their own quiet row, so they don't
              crowd the icon switcher. */}
          {view === 'notifications' && notifications.length > 0 && (
            <div className="flex items-center justify-end gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50/50">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all read"
                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-brand-blue-dark px-1.5 py-0.5 rounded hover:bg-white"
                >
                  <CheckCheck size={12} /> Read all
                </button>
              )}
              <button
                onClick={clearAll}
                title="Clear all notifications"
                className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-white"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
          )}

          {showRequests ? requestsPanel : showAnnouncements ? announcementsPanel : showIdeas ? ideasPanel : (
          <>
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-3 hover:bg-gray-50/50 cursor-pointer ${!n.read ? 'bg-brand-blue/10' : ''}`}
                  onClick={() => !n.read && markAsRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-brand-blue-dark mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{formatTime(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
          )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
