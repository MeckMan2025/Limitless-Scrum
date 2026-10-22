import { Check, X } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from './usePermissions'
import { usePendingRequests } from './usePendingRequests'

// The requests list shown inside the notification bell's panel. Returns the
// pending count plus the rendered list, so the bell can badge its Requests icon
// and swap the panel body without owning any of this logic.
//
// A hook rather than a component because the bell needs the count for its badge
// at the same time as the markup for its body.
//
// Approve/deny come from usePendingRequests — the same hook the full Requests
// view uses — so approving keeps its real side effects rather than getting a
// second implementation that only flips a status.
export function useRequestsPanel() {
  const { user, username } = useUser()
  const { canReviewRequests, outreachEventRequestsOnly, canReviewExpenseRequests, isGuest } = usePermissions()
  const { requests, handleApprove, handleDeny } = usePendingRequests()

  // Leads see everything pending, everyone else only their own, and Outreach
  // only event requests.
  const mine = isGuest ? [] : (requests || [])
    .filter(r =>
      canReviewRequests ||
      (r.type === 'expense' && canReviewExpenseRequests) ||
      r.requested_by_user_id === user?.id || r.requested_by === username)
    .filter(r => !outreachEventRequestsOnly || r.type === 'calendar_event')

  const label = (r) =>
    r.type === 'role_request'
      ? `Requesting "${r.data?.role}" role`
      : (r.data?.title || r.data?.name || 'Request')

  const panel = mine.length === 0 ? (
    <div className="p-6 text-center text-sm text-gray-400">No pending requests</div>
  ) : (
    <div className="divide-y divide-gray-100">
      {mine.map(r => (
        <div key={r.id} className="p-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">{label(r)}</p>
            {r.data?.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.data.description}</p>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              {String(r.type).replace(/_/g, ' ')} · {r.requested_by}
            </p>
          </div>
          {(canReviewRequests || (r.type === 'expense' && canReviewExpenseRequests)) ? (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => handleApprove(r)} title="Approve" className="p-1.5 rounded-lg hover:bg-green-50">
                <Check size={15} className="text-green-500" />
              </button>
              <button onClick={() => handleDeny(r)} title="Deny" className="p-1.5 rounded-lg hover:bg-red-50">
                <X size={15} className="text-red-400" />
              </button>
            </div>
          ) : (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              Pending
            </span>
          )}
        </div>
      ))}
    </div>
  )

  return { pendingCount: mine.length, panel }
}
