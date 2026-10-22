import { useState, useEffect } from 'react'
import { teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { Check, X, Bell, Trash2 } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import NotificationBell from './NotificationBell'
import { usePendingRequests } from '../hooks/usePendingRequests'
import { useToast } from './ToastProvider'

const categoryColors = [
  { border: 'border-brand-blue', text: 'text-brand-blue-dark' },
  { border: 'border-brand-yellow', text: 'text-brand-yellow-dark' },
  { border: 'border-brand-silver', text: 'text-brand-silver-dark' },
]

const typeCategories = [
  { key: 'task', label: 'Task Requests' },
  { key: 'board', label: 'Board Requests' },
  { key: 'calendar_event', label: 'Calendar Events' },
  { key: 'role_request', label: 'Role Requests' },
  { key: 'leave_task', label: 'Leave Task Requests' },
]

const TYPE_LABEL = {
  task: 'Task', board: 'Board', calendar_event: 'Calendar Event',
  role_request: 'Role', leave_task: 'Leave Task',
}

// The full "what they're asking for" preview, tailored to each request type.
function previewRows(r) {
  const d = r.data || {}
  const rows = []
  const add = (label, val) => {
    if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) return
    rows.push([label, Array.isArray(val) ? val.join(', ') : String(val)])
  }
  if (r.type === 'role_request') {
    add('Role requested', d.role)
  } else if (r.type === 'calendar_event') {
    add('Event', d.name)
    add('Date', d.date_key)
    add('Time', [d.start_time, d.end_time].filter(Boolean).join(' – '))
    add('Location', d.location)
    add('Category', d.category || d.event_type)
    add('Priority', d.priority && d.priority !== 'normal' ? d.priority : '')
    add('Department', d.department)
    add('Assigned to', d.assigned_to)
    add('Details', d.description)
  } else if (r.type === 'task') {
    add('Title', d.title || d.name)
    add('Assignee', d.assignee)
    add('Priority', d.priority)
    add('Due', d.dueDate || d.due_date)
    add('Details', d.description)
  } else if (r.type === 'board') {
    add('Board name', d.name || d.title)
    add('Details', d.description)
  } else {
    add('Title', d.title || d.name)
    add('Details', d.description)
  }
  return rows
}

function RequestsView({ tabs = [] }) {
  const { username, user } = useUser()
  const { canReviewRequests, hasLeadTag, outreachEventRequestsOnly, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const { requests, handleApprove, handleDeny, handleRemind } = usePendingRequests()
  const { addToast } = useToast()
  const [history, setHistory] = useState([])
  const [remindingId, setRemindingId] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'history'
  const [preview, setPreview] = useState(null) // request being previewed in the modal

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Load history (approved + denied) via direct fetch
  useEffect(() => {
    async function loadHistory() {
      try {
        let url = `${supabaseUrl}/rest/v1/requests?${SCOPE}&status=in.(approved,denied)&order=created_at.desc&limit=50&select=*`
        // Teammates only see their own history
        if (!canReviewRequests && user) {
          url += `&requested_by_user_id=eq.${user.id}`
        }
        const res = await fetch(url, {
          headers: restHeaders()
        })
        if (res.ok) setHistory(await res.json())
      } catch (err) {
        console.error('Failed to load request history:', err)
      }
    }
    loadHistory()
  }, [requests, canReviewRequests, user])

  // Filter pending requests for teammates (only their own)
  const ownRequests = canReviewRequests
    ? requests
    : requests.filter(r => r.requested_by_user_id === user?.id || r.requested_by === username)

  // Outreach only deals in event requests — hide every other type from them.
  const visibleRequests = outreachEventRequestsOnly
    ? ownRequests.filter(r => r.type === 'calendar_event')
    : ownRequests

  // Combine and filter based on toggle
  const filteredRequests = filter === 'pending'
    ? visibleRequests
    : filter === 'history'
    ? history
    : [...visibleRequests, ...history]

  const totalRequests = filteredRequests.length

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const onRemind = async (r) => {
    setRemindingId(r.id)
    const result = await handleRemind(r)
    setRemindingId(null)
    if (result.success) {
      addToast('Reminder sent to approvers', 'success')
    } else {
      addToast(result.error || 'Failed to send reminder', 'error')
    }
  }

  const handleDeleteHistory = async (id) => {
    setHistory(prev => prev.filter(r => r.id !== id))
    try {
      await fetch(`${supabaseUrl}/rest/v1/requests?id=eq.${id}`, {
        method: 'DELETE',
        headers: restHeaders(),
      })
    } catch (err) {
      console.error('Failed to delete request:', err)
    }
  }

  const renderRequestCard = (r) => {
    const boardTabs = tabs.filter(t => !t.type)
    const boardName = (id) => {
      const b = boardTabs.find(t => t.id === id)
      return b ? b.name : (id ? id.charAt(0).toUpperCase() + id.slice(1) : '')
    }
    const isPending = r.status === 'pending'

    return (
      <div
        key={r.id}
        onClick={() => setPreview(r)}
        className={`bg-white rounded-lg p-3 shadow-sm border-l-4 shrink-0 w-[260px] snap-center cursor-pointer hover:shadow-md transition-shadow ${
          isPending ? 'border-l-amber-400' : r.status === 'approved' ? 'border-l-green-400' : 'border-l-red-400'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                isPending
                  ? 'bg-amber-100 text-amber-700'
                  : r.status === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-600'
              }`}>
                {isPending ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Denied'}
              </span>
              {r.board_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-brand-blue/30 text-brand-blue-dark">
                  {boardName(r.board_id)}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-700 truncate">
              {r.type === 'role_request'
                ? `Requesting "${r.data?.role}" role`
                : (r.data?.title || r.data?.name)}
            </p>
            {r.data?.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.data.description}</p>
            )}
            {r.type === 'calendar_event' && r.data?.event_type && r.data.event_type !== 'other' && (
              <p className="text-[10px] text-gray-400 mt-0.5 capitalize">Type: {r.data.event_type}</p>
            )}
            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
              <span>By <span className="font-medium text-brand-yellow-dark">{r.requested_by}</span></span>
              <span>{formatDate(r.created_at)}</span>
            </div>
            {!isPending && r.reviewed_by && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                Reviewed by <span className="font-medium">{r.reviewed_by}</span>
                {r.reviewed_at && <> on {formatDate(r.reviewed_at)}</>}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {isPending && canReviewRequests && (
              <div className="flex gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleApprove(r) }}
                  className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors"
                  title="Approve"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeny(r) }}
                  className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                  title="Deny"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {isPending && r.requested_by === username && !canReviewRequests && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemind(r) }}
                disabled={remindingId === r.id}
                className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-500 transition-colors disabled:opacity-50"
                title="Remind approvers"
              >
                <Bell size={14} />
              </button>
            )}
            {!isPending && canReviewRequests && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteHistory(r.id) }}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-4 pl-14 md:pl-4 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Requests
            </h1>
            <p className="text-sm text-gray-300">
              {totalRequests} request{totalRequests !== 1 ? 's' : ''}{' '}
              {filter === 'pending' ? 'pending' : filter === 'history' ? 'in history' : 'total'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'history', label: 'History' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f.key ? 'bg-white text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <NotificationBell />
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-8 px-2 md:px-6">
            {typeCategories.map((cat, index) => {
              const catRequests = filteredRequests.filter(r => r.type === cat.key)
              const color = categoryColors[index % categoryColors.length]
              return (
                <div key={cat.key}>
                  <h2 className={`text-lg font-bold ${color.text} mb-3 border-b-2 ${color.border} pb-2`}>
                    {cat.label}
                    <span className="ml-2 text-sm font-normal text-gray-400">({catRequests.length})</span>
                  </h2>
                  {catRequests.length === 0 ? (
                    <p className="text-sm text-gray-400 ml-2">No requests</p>
                  ) : (
                    <div className="flex flex-nowrap gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:snap-none">
                      {catRequests.map(r => renderRequestCard(r))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      </main>

      {preview && (() => {
        const r = preview
        const d = r.data || {}
        const isPending = r.status === 'pending'
        const title = r.type === 'role_request'
          ? `Requesting the "${d.role}" role`
          : (d.title || d.name || TYPE_LABEL[r.type] || 'Request')
        const rows = previewRows(r)
        const canAct = isPending && canReviewRequests
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3" onClick={() => setPreview(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-brand-yellow-dark">{TYPE_LABEL[r.type] || 'Request'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    isPending ? 'bg-amber-100 text-amber-700' : r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {isPending ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Denied'}
                  </span>
                  <button onClick={() => setPreview(null)} className="ml-auto p-1 rounded hover:bg-gray-100">
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-gray-800 leading-snug">{title}</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Requested by <span className="font-medium text-brand-yellow-dark">{r.requested_by}</span> · {formatDate(r.created_at)}
                </p>
              </div>

              {/* What they're asking for */}
              <div className="px-5 py-4 overflow-y-auto space-y-3">
                {rows.length ? rows.map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{val}</p>
                  </div>
                )) : (
                  <p className="text-sm text-gray-400">No extra details were provided with this request.</p>
                )}
                {!isPending && r.reviewed_by && (
                  <p className="text-[11px] text-gray-400 pt-1">
                    Reviewed by <span className="font-medium">{r.reviewed_by}</span>{r.reviewed_at && <> on {formatDate(r.reviewed_at)}</>}
                  </p>
                )}
              </div>

              {/* Actions */}
              {canAct ? (
                <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                  <button
                    onClick={() => { setPreview(null); addToast('Kept as a request to review later', 'success') }}
                    className="w-full py-2.5 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    Save for review
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { handleDeny(r); setPreview(null) }}
                      className="flex-1 py-2.5 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <X size={16} /> Deny
                    </button>
                    <button
                      onClick={() => { handleApprove(r); setPreview(null) }}
                      className="flex-1 py-2.5 rounded-xl font-bold text-white bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} /> Approve
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 border-t border-gray-100">
                  <button onClick={() => setPreview(null)} className="w-full py-2.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default RequestsView
