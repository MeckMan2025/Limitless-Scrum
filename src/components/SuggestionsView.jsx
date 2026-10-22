import { useState, useEffect } from 'react'
import { onlyMyTeam, stampStored, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { Send, Trash2, Check, Clock, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { triggerPush } from '../utils/pushHelper'
import { ideaReviewerIds } from '../lib/cofounders'
import NotificationBell from './NotificationBell'

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-600',
}

function SuggestionsView() {
  const { username, user } = useUser()
  const { canReviewSuggestions, canSubmitSuggestions, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [suggestions, setSuggestions] = useState([])
  const [newSuggestion, setNewSuggestion] = useState('')
  const [submitError, setSubmitError] = useState('')

  const isReviewer = canReviewSuggestions
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders()

  // Load suggestions
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    // Plain REST with the anon key, like the rest of the app. This was the one
    // screen still reading through the Supabase JS client, and when that call
    // failed it failed silently — leaving three empty columns that looked like
    // the suggestions had never saved.
    async function load() {
      try {
        // Reviewers read every team's ideas; everyone else sees their own.
        const where = [
          isReviewer ? null : SCOPE,
          'select=*', 'order=created_at.desc',
          !isReviewer && username ? `author=eq.${encodeURIComponent(username)}` : null,
        ].filter(Boolean).join('&')
        const res = await fetch(`${supabaseUrl}/rest/v1/suggestions?${where}`, { headers })
        if (!res.ok) throw new Error(await res.text() || res.statusText)
        const data = await res.json()
        setSuggestions(Array.isArray(data) ? data : [])
        setLoadError('')
      } catch (err) {
        console.error('Failed to load suggestions:', err)
        setLoadError("Couldn't load suggestions — pull down to retry.")
      }
    }
    if (username) load()
  }, [username, isReviewer])

  // Real-time subscription. Reviewers hear about every team's ideas, so the
  // own-team filter only applies to everyone else.
  useEffect(() => {
    const mine = isReviewer ? (h => h) : onlyMyTeam
    const channel = supabase
      .channel('suggestions-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions' }, mine((payload) => {
        setSuggestions(prev => {
          if (prev.some(s => s.id === payload.new.id)) return prev
          if (isReviewer || payload.new.author === username) {
            return [payload.new, ...prev]
          }
          return prev
        })
      }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'suggestions' }, mine((payload) => {
        setSuggestions(prev => prev.map(s => s.id === payload.new.id ? payload.new : s))
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'suggestions' }, mine((payload) => {
        setSuggestions(prev => prev.filter(s => s.id !== payload.old.id))
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isReviewer, username])

  // A suggestion that nobody is told about is a suggestion nobody reads.
  // Every idea, from every team, goes to Kayden and Yukti — the same two the
  // "not built yet" idea boxes tell.
  const notifyReviewers = async (suggestion) => {
    try {
      const team = suggestion.team_number ? ` (team ${suggestion.team_number})` : ''
      for (const id of await ideaReviewerIds(supabaseUrl, headers)) {
        if (id === user?.id) continue
        const notif = {
          id: String(Date.now()) + Math.random().toString(36).slice(2) + id.slice(0, 4),
          user_id: id,
          type: 'suggestion',
          title: '💡 New suggestion',
          body: `${suggestion.author}${team}: "${suggestion.text.slice(0, 90)}${suggestion.text.length > 90 ? '…' : ''}"`,
        }
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(notif),
        })
        triggerPush(notif)
      }
    } catch (err) { console.error('Failed to notify about the suggestion:', err) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newSuggestion.trim()) return
    setSubmitError('')

    const authorName = username || user?.email || 'Anonymous'
    const suggestion = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      author: authorName,
      text: newSuggestion.trim(),
      created_at: new Date().toISOString(),
    }

    setSuggestions(prev => [suggestion, ...prev])
    setNewSuggestion('')

    try {
      const { error } = await supabase
        .from('suggestions')
        .insert(stampStored({ id: suggestion.id, author: suggestion.author, text: suggestion.text }))
      if (error) {
        console.error('Suggestion insert error:', JSON.stringify(error))
        throw new Error(error.message || error.code || 'Unknown DB error')
      }
      // Verify it saved by reading it back
      const { data: verify } = await supabase
        .from('suggestions')
        .select('*')
        .eq('id', suggestion.id)
        .single()
      notifyReviewers(verify || suggestion)
      if (verify) {
        setSuggestions(prev => prev.map(s => s.id === suggestion.id ? verify : s))
      } else {
        throw new Error('Insert returned no error but row not found in DB')
      }
    } catch (err) {
      console.error('Suggestion save failed:', err)
      setSubmitError('Failed to save — ' + err.message)
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    }
  }

  const handleSetStatus = async (id, status) => {
    const suggestion = suggestions.find(s => s.id === id)
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s))

    fetch(`${supabaseUrl}/rest/v1/suggestions?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status }),
    }).catch(err => console.error('Failed to update suggestion:', err))

    // Notify the suggestion author
    if (suggestion?.author) {
      try {
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?display_name=ilike.${encodeURIComponent(suggestion.author)}&select=id`,
          { headers }
        )
        if (!profileRes.ok) {
          console.error('Profile lookup failed:', await profileRes.text())
          return
        }
        const profiles = await profileRes.json()
        if (profiles.length > 0) {
          const notif = {
            id: String(Date.now()) + Math.random().toString(36).slice(2),
            user_id: profiles[0].id,
            type: status === 'approved' ? 'suggestion_approved' : 'suggestion_denied',
            title: status === 'approved' ? 'Suggestion Approved' : 'Suggestion Denied',
            body: `Your suggestion "${suggestion.text.slice(0, 50)}${suggestion.text.length > 50 ? '...' : ''}" was ${status} by ${username}.`,
          }
          const notifRes = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(notif),
          })
          if (!notifRes.ok) {
            console.error('Notification insert failed:', await notifRes.text())
          }
          triggerPush(notif)
        }
      } catch (err) {
        console.error('Failed to notify suggestion author:', err)
      }
    }
  }

  const handleDelete = async (id) => {
    const before = suggestions
    setSuggestions(prev => prev.filter(s => s.id !== id))
    try {
      // Checked, because a refused delete used to look exactly like a
      // successful one until the page was reloaded and the row came back.
      const res = await fetch(`${supabaseUrl}/rest/v1/suggestions?id=eq.${id}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) throw new Error(await res.text() || res.statusText)
    } catch (err) {
      console.error('Failed to delete suggestion:', err)
      setSuggestions(before)
      setLoadError("That one couldn't be deleted — it's still there.")
    }
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const submitForm = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-700 text-center">
        What would make this app better?
      </h2>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">💡 Having trouble explaining your idea?</p>
        <p className="text-blue-600">
          If your feature idea is complex or hard to put into words, try pasting
          {' '}<a
            href="https://chatgpt.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium hover:text-blue-800"
          >this prompt into ChatGPT</a>{' '}
          and it will ask you questions to help you write a clear, detailed suggestion:
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer font-medium text-blue-700 hover:text-blue-900">
            Click to see the prompt to copy
          </summary>
          <div className="mt-2 bg-white border border-blue-100 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap select-all">
{`I have an idea for a feature I want added to my team's app, but I'm having trouble explaining it clearly. I need your help turning my idea into a detailed, well-written feature request.

Please ask me questions one at a time to understand my idea. Keep going until you have enough detail. Here are some things to ask about:

1. What is the feature? (Get me to describe the basic idea)
2. What problem does it solve? (Why do I want this?)
3. Who would use it? (Just me, my whole team, leads only, etc.)
4. How should it look/work? (Where in the app, what buttons, what happens when you click them)
5. Are there any edge cases? (What if someone does X, what should happen?)
6. Any examples of something similar? (Other apps that do this)

After you've asked enough questions, write me a final polished feature suggestion that I can copy and paste directly into the suggestion box. Make it clear, specific, and easy for a developer to understand. Format it like:

**Feature:** [Name]
**Problem:** [What it solves]
**How it works:** [Step by step description]
**Details:** [Any extra info]`}
          </div>
        </details>
      </div>
      <textarea
        value={newSuggestion}
        onChange={(e) => setNewSuggestion(e.target.value)}
        placeholder="Type your suggestion here..."
        rows={4}
        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-transparent resize-none text-sm"
      />
      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}
      <button
        type="submit"
        disabled={!newSuggestion.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors font-semibold text-gray-700"
      >
        <Send size={16} />
        Submit Suggestion
      </button>
    </form>
  )

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="py-4 px-4 flex items-center text-gray-200">
          <div className="w-10 shrink-0 text-gray-200" />
          <div className="flex-1 text-center">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Suggestions
            </h1>
            <p className="text-sm text-gray-300">
              {isReviewer ? 'Ideas from every team, all in one place' : 'How can we make this app better?'}
            </p>
          </div>
          <NotificationBell />
        </div>
      </header>

      {isReviewer ? (
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Submit form for reviewers too */}
            {submitForm}
            {loadError && <p className="text-sm text-red-500 text-center">{loadError}</p>}

            {[
              // Anything not yet decided counts as pending. Dismissing an idea
              // from the bell's 💡 panel sets status 'reviewed', which matched
              // no column and made the suggestion vanish from this board
              // entirely — seen is not the same as answered. Written as
              // "not approved and not denied" so a new status can never
              // silently disappear again.
              { key: 'pending', label: 'Pending', color: 'bg-amber-200', items: suggestions.filter(s => s.status !== 'approved' && s.status !== 'denied') },
              { key: 'approved', label: 'Approved', color: 'bg-green-200', items: suggestions.filter(s => s.status === 'approved') },
              { key: 'denied', label: 'Denied', color: 'bg-red-200', items: suggestions.filter(s => s.status === 'denied') },
            ].map(section => (
              <div key={section.key} className="flex flex-col">
                <div className={`${section.color} rounded-t-lg px-4 py-2 font-semibold text-gray-700`}>
                  {section.label}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({section.items.length})
                  </span>
                </div>
                <div className="bg-gray-50 rounded-b-lg p-3 min-h-[60px] space-y-2">
                  {section.items.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2 text-center">No {section.label.toLowerCase()} suggestions</p>
                  ) : (
                    section.items.map((s) => (
                      <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-brand-yellow-dark">{s.author}</span>
                          {/* Which team it came from. Home-team ideas carry no number. */}
                          {s.team_number && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-blue/30 text-gray-600 font-medium">Team {s.team_number}</span>
                          )}
                          <span className="text-xs text-gray-400">{formatDate(s.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mb-3">{s.text}</p>
                        <div className="flex items-center gap-2">
                          {(!s.status || s.status === 'pending') && (
                            <>
                              <button
                                onClick={() => handleSetStatus(s.id, 'approved')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 transition-colors text-green-600 text-xs font-medium"
                              >
                                <Check size={14} />
                                Approve
                              </button>
                              <button
                                onClick={() => handleSetStatus(s.id, 'denied')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors text-red-500 text-xs font-medium"
                              >
                                <X size={14} />
                                Deny
                              </button>
                            </>
                          )}
                          {s.status && s.status !== 'pending' && (
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500 text-xs font-medium"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      ) : !canSubmitSuggestions ? (
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-md mx-auto text-center mt-20">
            <p className="text-gray-400">You can view suggestions but need a teammate role to submit.</p>
          </div>
        </main>
      ) : (
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-md mx-auto space-y-6">
            {submitForm}

            {suggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Your Suggestions</h3>
                {suggestions.map((s) => (
                  <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status] || STATUS_STYLES.pending}`}>
                        {s.status === 'approved' ? 'Approved' : s.status === 'denied' ? 'Denied' : 'Pending'}
                      </span>
                      <span className="text-xs text-gray-400">{s.created_at ? formatDate(s.created_at) : 'Just now'}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-1">{s.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  )
}

export default SuggestionsView
