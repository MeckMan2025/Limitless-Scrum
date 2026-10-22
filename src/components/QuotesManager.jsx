import { useState, useEffect } from 'react'
import { onlyMyTeam, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { MessageSquareQuote, Check, Trash2, X, ArrowLeft } from 'lucide-react'

export default function QuotesManager({ onBack }) {
  const { username } = useUser()
  const { canApproveQuotes, isGuest, hasLeadTag, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const [approvedQuotes, setApprovedQuotes] = useState([])
  const [pendingQuotes, setPendingQuotes] = useState([])
  const [quoteText, setQuoteText] = useState('')
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    const headers = restHeaders()
    fetch(`${supabaseUrl}/rest/v1/fun_quotes?${SCOPE}&select=*&order=created_at.desc`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setApprovedQuotes(data.filter(q => q.approved))
        setPendingQuotes(data.filter(q => !q.approved))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('quotes-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fun_quotes' }, onlyMyTeam((payload) => {
        if (payload.new.approved) {
          setApprovedQuotes(prev => prev.some(q => q.id === payload.new.id) ? prev : [payload.new, ...prev])
        } else {
          setPendingQuotes(prev => prev.some(q => q.id === payload.new.id) ? prev : [payload.new, ...prev])
        }
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fun_quotes' }, onlyMyTeam((payload) => {
        if (payload.new.approved) {
          setPendingQuotes(prev => prev.filter(q => q.id !== payload.new.id))
          setApprovedQuotes(prev => prev.some(q => q.id === payload.new.id) ? prev : [payload.new, ...prev])
        }
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'fun_quotes' }, onlyMyTeam((payload) => {
        setPendingQuotes(prev => prev.filter(q => q.id !== payload.old.id))
        setApprovedQuotes(prev => prev.filter(q => q.id !== payload.old.id))
      }))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const handleSubmitQuote = () => {
    if (!quoteText.trim()) return
    const newQuote = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      content: quoteText.trim(),
      submitted_by: username,
      approved: false,
      approved_by: '',
      created_at: new Date().toISOString(),
    }
    setPendingQuotes(prev => [newQuote, ...prev])
    setQuoteText('')
    setShowQuoteModal(false)
    setFeedback('Quote submitted for approval!')
    setTimeout(() => setFeedback(null), 3000)
    fetch(`${supabaseUrl}/rest/v1/fun_quotes`, {
      method: 'POST',
      headers: restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify(newQuote),
    }).catch(err => console.error('Failed to submit quote:', err))
  }

  const handleApproveQuote = (id) => {
    const quote = pendingQuotes.find(q => q.id === id)
    setPendingQuotes(prev => prev.filter(q => q.id !== id))
    if (quote) setApprovedQuotes(prev => [{ ...quote, approved: true, approved_by: username }, ...prev])
    fetch(`${supabaseUrl}/rest/v1/fun_quotes?id=eq.${id}`, {
      method: 'PATCH',
      headers: restHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ approved: true, approved_by: username }),
    }).catch(err => console.error('Failed to approve quote:', err))
  }

  const handleDenyQuote = (id) => {
    setPendingQuotes(prev => prev.filter(q => q.id !== id))
    fetch(`${supabaseUrl}/rest/v1/fun_quotes?id=eq.${id}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(err => console.error('Failed to deny quote:', err))
  }

  const handleDeleteQuote = (id) => {
    if (!window.confirm('Delete this approved quote?')) return
    setApprovedQuotes(prev => prev.filter(q => q.id !== id))
    fetch(`${supabaseUrl}/rest/v1/fun_quotes?id=eq.${id}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(err => console.error('Failed to delete quote:', err))
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="max-w-lg mx-auto space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center gap-2">
          <MessageSquareQuote size={20} className="text-brand-silver-dark" />
          <h2 className="text-lg font-bold text-gray-800">Fun Quotes</h2>
        </div>

        {feedback && (
          <div className="text-center text-green-600 font-medium animate-pulse text-sm">
            {feedback}
          </div>
        )}

        {/* Submit quote button */}
        {!isGuest && (
          <button
            onClick={() => setShowQuoteModal(true)}
            className="w-full px-4 py-3 rounded-xl bg-brand-silver/30 hover:bg-brand-silver/50 transition-colors text-sm font-medium text-gray-700"
          >
            Submit a Fun Quote / Joke
          </button>
        )}

        {/* Pending quotes (leads can approve/deny) */}
        {canApproveQuotes && pendingQuotes.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">Pending Approval ({pendingQuotes.length})</h3>
            <div className="space-y-2">
              {pendingQuotes.map(q => (
                <div key={q.id} className="bg-yellow-50 rounded-xl p-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-700 italic">"{q.content}"</p>
                    <p className="text-xs text-gray-400 mt-1">- {q.submitted_by}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleApproveQuote(q.id)} className="p-1.5 text-green-500 hover:text-green-700 transition-colors" title="Approve">
                      <Check size={16} />
                    </button>
                    <button onClick={() => handleDenyQuote(q.id)} className="p-1.5 text-red-400 hover:text-red-600 transition-colors" title="Deny">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approved quotes */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Approved ({approvedQuotes.length})</h3>
          {approvedQuotes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No approved quotes yet.</p>
          ) : (
            <div className="space-y-2">
              {approvedQuotes.map(q => (
                <div key={q.id} className="bg-white rounded-xl p-3 shadow-sm flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-700 italic">"{q.content}"</p>
                    <p className="text-xs text-gray-400 mt-1">- {q.submitted_by}</p>
                  </div>
                  {canApproveQuotes && (
                    <button onClick={() => handleDeleteQuote(q.id)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quote submit modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowQuoteModal(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Submit a Fun Quote</h3>
              <button onClick={() => setShowQuoteModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400">Quotes are reviewed by team leads before appearing. Keep it fun and team-friendly!</p>
            <textarea
              value={quoteText}
              onChange={e => setQuoteText(e.target.value)}
              placeholder="Type your quote, joke, or fun message..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent resize-none"
              autoFocus
            />
            <button
              onClick={handleSubmitQuote}
              disabled={!quoteText.trim()}
              className="w-full py-2 rounded-lg font-medium bg-brand-silver hover:bg-brand-silver-dark transition-colors disabled:opacity-40"
            >
              Submit Quote
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
