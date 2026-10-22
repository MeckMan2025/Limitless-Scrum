import { useState, useRef, useEffect } from 'react'
import { Inbox, Check, X, Bell } from 'lucide-react'
import { usePendingRequests } from '../hooks/usePendingRequests'
import { useUser } from '../contexts/UserContext'
import { useToast } from './ToastProvider'

function RequestsBadge({ type, boardId }) {
  const { requests, count, handleApprove, handleDeny, handleRemind } = usePendingRequests({ type, boardId })
  const { username } = useUser()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [remindingId, setRemindingId] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const formatDate = (timestamp) => {
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 rounded-lg hover:bg-brand-blue/30 transition-colors"
        title="Pending requests"
      >
        <Inbox size={20} className="text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Pending Requests ({count})
            </h3>
          </div>

          {count === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              No pending requests
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map(r => (
                <div key={r.id} className="p-3 hover:bg-gray-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          r.type === 'task'
                            ? 'bg-brand-yellow/40 text-brand-yellow-dark'
                            : 'bg-brand-silver/40 text-brand-silver-dark'
                        }`}>
                          {r.type === 'task' ? 'Task' : 'Event'}
                        </span>
                        <span className="text-[10px] text-gray-400">{formatDate(r.created_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {r.data?.title || r.data?.name}
                      </p>
                      {r.data?.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.data.description}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        by <span className="font-medium text-brand-yellow-dark">{r.requested_by}</span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleApprove(r)}
                          className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors"
                          title="Approve"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => handleDeny(r)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                          title="Deny"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {r.requested_by === username && (
                        <button
                          onClick={() => onRemind(r)}
                          disabled={remindingId === r.id}
                          className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-500 transition-colors disabled:opacity-50"
                          title="Remind approvers"
                        >
                          <Bell size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RequestsBadge
