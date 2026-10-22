import { useState, useEffect, useCallback } from 'react'
import { teamScope } from '../lib/teamScope'
import { lazyHeadersWith } from '../lib/restHeaders'
import { Plus, Check, X, MessageCircle, ExternalLink } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { usePendingRequests } from '../hooks/usePendingRequests'
import { useToast } from './ToastProvider'
import { triggerPush } from '../utils/pushHelper'
import { notifyRequestReviewers } from '../utils/requestRouting'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })

const money = (n) => {
  const v = Number(n) || 0
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
}

const STATUS_CHIP = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-600',
  discussion: 'bg-blue-100 text-blue-700',
}
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', denied: 'Denied', discussion: 'Needs discussion' }

// Teammates ask for money here (item, cost, reason, optional link). Finance
// members and leads review: approve, deny, or mark for discussion. Approve and
// deny reuse usePendingRequests so status changes + requester notifications
// stay in one place; "needs discussion" is the one status this page owns.
export default function ExpenseRequests() {
  const { username, user } = useUser()
  const { canReviewExpenseRequests, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const { requests: pending, handleApprove, handleDeny } = usePendingRequests({ type: 'expense' })
  const { addToast } = useToast()

  const [mine, setMine] = useState([])
  const [discussion, setDiscussion] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [item, setItem] = useState('')
  const [cost, setCost] = useState('')
  const [reason, setReason] = useState('')
  const [link, setLink] = useState('')

  const loadLists = useCallback(async () => {
    try {
      if (user) {
        const r = await fetch(
          `${supabaseUrl}/rest/v1/requests?${SCOPE}&type=eq.expense&requested_by_user_id=eq.${user.id}&order=created_at.desc&limit=25&select=*`,
          { headers }
        )
        if (r.ok) setMine(await r.json())
      }
      if (canReviewExpenseRequests) {
        const d = await fetch(
          `${supabaseUrl}/rest/v1/requests?${SCOPE}&type=eq.expense&status=eq.discussion&order=created_at.desc&select=*`,
          { headers }
        )
        if (d.ok) setDiscussion(await d.json())
      }
    } catch { /* ignore */ }
  }, [user, canReviewExpenseRequests])

  useEffect(() => {
    loadLists()
    const ch = supabase
      .channel('expense-requests-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, loadLists)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [loadLists])

  const submit = async () => {
    const amt = parseFloat(cost)
    if (!item.trim() || !amt || amt <= 0 || !reason.trim()) return
    const request = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      type: 'expense',
      data: { title: item.trim(), cost: amt, reason: reason.trim(), link: link.trim() },
      requested_by: username,
      requested_by_user_id: user?.id,
      status: 'pending',
    }
    setItem(''); setCost(''); setReason(''); setLink(''); setShowForm(false)
    addToast('Expense request submitted', 'success')
    try {
      await fetch(`${supabaseUrl}/rest/v1/requests`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(request),
      })
      notifyRequestReviewers(request)
    } catch (err) { console.error('Failed to submit expense request:', err) }
    loadLists()
  }

  // The one status the shared hook doesn't know: park it for discussion.
  const markDiscussion = async (r) => {
    try {
      await fetch(`${supabaseUrl}/rest/v1/requests?id=eq.${r.id}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'discussion', reviewed_by: username, reviewed_at: new Date().toISOString() }),
      })
      if (r.requested_by_user_id) {
        const notif = {
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          user_id: r.requested_by_user_id,
          type: 'request_discussion',
          title: 'Expense Needs Discussion',
          body: `Your expense request "${r.data?.title}" needs discussion — find ${username} to talk it through.`,
        }
        await fetch(`${supabaseUrl}/rest/v1/notifications`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(notif) })
        triggerPush(notif)
      }
    } catch (err) { console.error('Failed to mark for discussion:', err) }
    loadLists()
  }

  const Row = ({ r, actions }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_CHIP[r.status] || STATUS_CHIP.pending}`}>
              {STATUS_LABEL[r.status] || r.status}
            </span>
            <span className="text-[10px] text-gray-400">{r.requested_by}</span>
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {r.data?.title} <span className="text-gray-400 font-normal">·</span> <span className="text-brand-silver-dark">{money(r.data?.cost)}</span>
          </p>
          {r.data?.reason && <p className="text-xs text-gray-500 mt-0.5">{r.data.reason}</p>}
          {r.data?.link && (
            <a href={r.data.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-blue-dark hover:underline mt-1">
              <ExternalLink size={11} /> {r.data.link.replace(/^https?:\/\//, '').slice(0, 40)}
            </a>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => handleApprove(r)} title="Approve" className="p-1.5 rounded-lg hover:bg-green-50">
              <Check size={16} className="text-green-500" />
            </button>
            <button onClick={() => markDiscussion(r)} title="Needs discussion" className="p-1.5 rounded-lg hover:bg-blue-50">
              <MessageCircle size={15} className="text-blue-400" />
            </button>
            <button onClick={() => handleDeny(r)} title="Deny" className="p-1.5 rounded-lg hover:bg-red-50">
              <X size={16} className="text-red-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 pl-14 md:pl-4 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Expense Requests
            </h1>
            <p className="text-sm text-gray-300">Ask before you buy — Finance reviews it</p>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Submit */}
          <section>
            {showForm ? (
              <div className="bg-white rounded-xl border border-gray-100 p-3.5 space-y-1.5">
                <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item (e.g. 2x goBILDA motor)" autoFocus className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
                <div className="flex gap-1.5">
                  <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="Cost $" className="w-28 text-sm border border-gray-100 rounded-lg px-2 py-1.5" />
                  <input value={link} onChange={e => setLink(e.target.value)} placeholder="Link (optional)" className="flex-1 min-w-0 text-sm border border-gray-100 rounded-lg px-2 py-1.5" />
                </div>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Why the team needs it" className="w-full text-sm border border-gray-100 rounded-lg px-2 py-1.5 resize-none" />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowForm(false)} className="flex-1 text-sm border rounded-lg py-1.5 hover:bg-gray-50">Cancel</button>
                  <button onClick={submit} disabled={!item.trim() || !(parseFloat(cost) > 0) || !reason.trim()} className="flex-1 text-sm bg-brand-silver/60 hover:bg-brand-silver disabled:opacity-50 rounded-lg py-1.5 font-semibold text-gray-700">Submit</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-brand-silver/40 hover:bg-brand-silver rounded-xl text-sm font-semibold text-gray-700 transition-colors">
                <Plus size={15} /> Request an Expense
              </button>
            )}
          </section>

          {/* Review queue — Finance + leads */}
          {canReviewExpenseRequests && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">To Review ({pending.length})</h2>
              {pending.length === 0 ? (
                <p className="text-sm text-gray-400">Nothing waiting.</p>
              ) : (
                <div className="space-y-2">{pending.map(r => <Row key={r.id} r={r} actions />)}</div>
              )}
            </section>
          )}

          {canReviewExpenseRequests && discussion.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">In Discussion ({discussion.length})</h2>
              <div className="space-y-2">{discussion.map(r => <Row key={r.id} r={r} actions />)}</div>
            </section>
          )}

          {/* My requests */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">My Requests</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-gray-400">You haven't requested anything yet.</p>
            ) : (
              <div className="space-y-2">{mine.map(r => <Row key={r.id} r={r} />)}</div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
