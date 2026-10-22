import { useState, useEffect, useRef } from 'react'
import { teamScope } from '../lib/teamScope'
import { usePermissions } from '../hooks/usePermissions'
import { lazyRestHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { VoteView, RevealCeremony } from './DesignMatrix'
import { getSession, withSession, hasFinished, tally, hasSeenReveal, withSeen } from '../lib/matrixSession'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = lazyRestHeaders

// If you've been picked to rate a decision matrix, it comes to you. A
// notification is easy to miss and the library shelf only helps people who
// think to go and look.
export default function MatrixRatingRequired() {
  const { username } = useUser()
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [pending, setPending] = useState([])
  const [reveal, setReveal] = useState(null)
  const [results, setResults] = useState(null)
  const [saving, setSaving] = useState(false)

  // Matrices this device has just submitted. The poll runs every few seconds,
  // so a request already in flight when you hit Submit comes back holding the
  // state from before your vote and would put you straight back into the form.
  // Anything in here stays out of the queue until the server is seen to have
  // caught up.
  const justSubmitted = useRef(new Set())

  // One reveal each. The record lives on the session, so it follows the account
  // to another device and survives clearing site data — localStorage alone meant
  // the drumroll replayed on every new browser and every fresh login.
  // The local key is kept as a fallback for when the write can't go through, and
  // is keyed by name so two accounts on one device don't silence each other.
  const seenKey = (id) => `matrix-revealed-${id}-${username || 'anon'}`
  const alreadySeen = (matrix) => {
    if (hasSeenReveal(getSession(matrix), username)) return true
    try { return localStorage.getItem(seenKey(matrix.id)) === '1' } catch { return true }
  }

  const markSeen = async (id) => {
    try { localStorage.setItem(seenKey(id), '1') } catch { /* private mode */ }
    if (!username) return
    try {
      // Re-read first: several people can finish watching at once, and this is a
      // read-modify-write on one jsonb column.
      const res = await fetch(`${REST_URL}/rest/v1/design_matrices?${SCOPE}&id=eq.${id}&select=scores`, { headers: HEADERS })
      if (!res.ok) return
      const rows = await res.json()
      const scores = rows?.[0]?.scores
      const se = getSession({ scores })
      if (!se || hasSeenReveal(se, username)) return
      await fetch(`${REST_URL}/rest/v1/design_matrices?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ scores: withSession(scores, withSeen(se, username)) }),
      })
    } catch (err) {
      // The local flag already stopped it here; worst case it replays on a
      // different device, which is what it did before anyway.
      console.error('Could not record that the reveal was seen:', err)
    }
  }

  const load = async () => {
    if (!username) return
    // Only what deciding and the vote form need. Most of the weight is the
    // votes inside `scores`, which both need, so the real saving is in how
    // rarely this runs — see the effect below.
    try {
      const res = await fetch(`${REST_URL}/rest/v1/design_matrices?${SCOPE}&select=id,title,description,options,criteria,scores`, { headers: HEADERS })
      if (!res.ok) return
      const rows = await res.json()
      // An empty matrix has nothing to rate — never trap anyone behind one.
      const real = (rows || []).filter(m => (m.options || []).length && (m.criteria || []).length)
      setPending(real.filter(m => {
        const s = getSession(m)
        if (!s || s.status !== 'open') return false
        if (!(s.participants || []).includes(username)) return false
        if (hasFinished(m, s, username)) {
          justSubmitted.current.delete(m.id)   // server has it — guard can go
          return false
        }
        return !justSubmitted.current.has(m.id)
      }))
      // A decision you helped make gets announced to you too, drumroll and all.
      const justDecided = real.find(m => {
        const s = getSession(m)
        return s && s.status === 'closed'
          && (s.participants || []).includes(username)
          && !alreadySeen(m)
      })
      if (justDecided) {
        const se = getSession(justDecided)
        const t = tally(justDecided, se)
        // Held on "Are you ready?" until the host reveals it, so everyone's
        // drumroll starts together — but only when the session actually says
        // it's unrevealed. A closed session with no flag was closed before the
        // flag existed; its host has long since had their reveal and will never
        // press the button again, so waiting on them is waiting forever.
        setReveal({
          id: justDecided.id,
          title: justDecided.title,
          winner: t.winner,
          tied: t.tied,
          byOption: t.byOption,
          criteria: justDecided.criteria || [],
          waiting: se.revealed === false,
        })
      } else {
        setReveal(null)
      }
    } catch { /* offline — try again on the next change */ }
  }

  useEffect(() => { load() }, [username])

  // Three ways in: the app tells us directly when it hosts or records a vote,
  // realtime carries other people's changes (design_matrices is in the
  // supabase_realtime publication), and a slow poll is the safety net for a
  // dropped socket. Coming back to the tab re-checks straight away.
  useEffect(() => {
    if (!username) return
    const onSignal = () => load()
    window.addEventListener('matrix-session-changed', onSignal)
    const ch = supabase
      .channel('matrix-rating-required')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'design_matrices' }, load)
      .subscribe()
    // This used to run every 3s in every open tab, hidden ones included, and
    // pulled the whole table each time — on its own it used up the Supabase
    // free tier's monthly egress. Realtime is the fast path now.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('matrix-session-changed', onSignal)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(ch)
      clearInterval(poll)
    }
  }, [username])

  if (reveal) {
    return (
      <RevealCeremony
        winner={reveal.winner}
        tied={reveal.tied}
        autoStart
        waiting={reveal.waiting}
        // "See the numbers" used to just close, dropping people back on
        // whichever page they were on — the table is on the Decision Matrix
        // page they were never taken to. Show it here instead.
        onDone={() => { markSeen(reveal.id); setResults(reveal); setReveal(null) }}
      />
    )
  }

  if (results) {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-900/80 backdrop-blur-sm overflow-y-auto">
        <div className="min-h-full flex items-start justify-center p-4 py-8">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{results.title}</h2>
              <p className="text-xs text-gray-400">Everyone's ratings, averaged</p>
            </div>
            {results.winner && (
              <div className="rounded-xl border-2 border-brand-yellow bg-brand-yellow/10 p-3 text-center">
                <p className="text-lg font-black text-gray-800">🏆 {results.winner.name}</p>
                <p className="text-xs text-gray-500">{results.winner.total.toFixed(1)} total</p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400">
                    <th className="text-left p-2">Option</th>
                    {results.criteria.map(c => <th key={c.id} className="p-2 font-semibold">{c.name}</th>)}
                    <th className="p-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {results.byOption.map((o, i) => (
                    <tr key={o.id} className={i === 0 && o.total > 0 ? 'bg-brand-yellow/10' : ''}>
                      <td className="p-2 font-semibold text-gray-700">{o.name}</td>
                      {o.perCriterion.map(c => (
                        <td key={c.id} className="p-2 text-center text-gray-600">{c.count ? c.avg.toFixed(1) : '—'}</td>
                      ))}
                      <td className="p-2 text-center font-bold text-gray-800">{o.total.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setResults(null)}
              className="w-full py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark text-sm font-semibold">
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  const matrix = pending[0]
  if (!matrix) return null
  const session = getSession(matrix)

  const submit = async (votes) => {
    setSaving(true)
    const next = { ...session, votes: { ...(session.votes || {}), [username]: votes } }
    try {
      await fetch(`${REST_URL}/rest/v1/design_matrices?id=eq.${matrix.id}`, {
        method: 'PATCH',
        headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ scores: withSession(matrix.scores, next), updated_at: new Date().toISOString() }),
      })
      justSubmitted.current.add(matrix.id)
      setPending(prev => prev.filter(m => m.id !== matrix.id))
      // Tell the Decision Matrix page, which is sitting behind this overlay
      // holding a copy of the matrix from before the vote. Without this it
      // keeps offering "Rate this matrix" and it reads as being asked twice.
      window.dispatchEvent(new Event('matrix-session-changed'))
    } catch (err) {
      console.error('Failed to save ratings:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-gradient-to-br from-brand-blue/95 via-brand-yellow/90 to-brand-silver/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="w-full max-w-lg bg-white/95 rounded-2xl shadow-xl p-5 space-y-4">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-yellow-dark">You've been asked to rate this</p>
            <p className="text-xs text-gray-400 mt-1">
              {session.hostedBy} is waiting on you{pending.length > 1 ? ` · ${pending.length - 1} more after this` : ''}
            </p>
          </div>
          {/* No cancel — this is the point of hosting one. */}
          <VoteView
            key={matrix.id}
            matrix={matrix}
            session={session}
            username={username}
            onSubmit={submit}
            onCancel={null}
          />
          {saving && <p className="text-center text-xs text-gray-400">Saving…</p>}
        </div>
      </div>
    </div>
  )
}
