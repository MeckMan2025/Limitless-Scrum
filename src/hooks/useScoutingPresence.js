import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { restHeaders, ensureUserToken } from '../lib/restHeaders'

// Who is scouting what, right now, on a live Competition Day.
//
// A form announces the job it is on (team and match, or a pit visit) over a
// presence channel for that day; the board listens and shows the row as
// "scouting now" with the name. Presence, not a table: it is true only while
// the form is open and vanishes the moment the phone locks or the form
// closes.
//
// ONE channel per day per device, kept for as long as the app is open.
// supabase-js hands back the existing channel for a topic, and removing a
// channel is asynchronous — so a board that closed its channel a moment
// before the form opened left the form holding a channel that was leaving,
// and the form's announcement went nowhere. Sharing one channel, and never
// tearing it down mid-day, is what makes the announcement land.

const days = new Map()   // dayId -> { channel, key, joined, job, listeners, state, beat }

function parse(state) {
  const out = []
  Object.entries(state).forEach(([username, metas]) => {
    const m = [...metas].reverse().find(p => p && p.team)
    if (m) out.push({ username, kind: m.kind, team: String(m.team).trim(), match: m.match == null ? '' : String(m.match).trim(), since: m.since })
  })
  return out
}

function entryFor(dayId, key) {
  let e = days.get(dayId)
  if (e && e.key === key) return e
  if (e) { clearInterval(e.beat); try { supabase.removeChannel(e.channel) } catch { /* fine */ } days.delete(dayId) }
  const channel = supabase.channel(`scouting-now-${dayId}`, { config: { presence: { key } } })
  e = { channel, key, joined: false, job: null, listeners: new Set(), state: [], beat: null }
  days.set(dayId, e)
  channel.on('presence', { event: 'sync' }, () => {
    e.state = parse(channel.presenceState())
    e.listeners.forEach(fn => fn(e.state))
  })
  const send = () => {
    if (!e.joined) return
    if (e.job) channel.track(e.job).catch(() => {})
    else channel.untrack().catch(() => {})
  }
  e.send = send
  ;(async () => {
    // Join with a live token, so a stale one on the socket does not refuse us.
    try {
      await ensureUserToken()
      const tok = restHeaders().Authorization.replace('Bearer ', '')
      if (tok) supabase.realtime.setAuth(tok)
    } catch { /* join anyway */ }
    channel.subscribe((status, err) => {
      console.log('[scouting-now]', status, err ? String(err) : '')
      e.joined = status === 'SUBSCRIBED'
      if (e.joined) send()
    })
  })()
  // Presence can drop a track that raced the join; a heartbeat re-sends the
  // job every so often while there is one, which also keeps it fresh.
  e.beat = setInterval(() => { if (e.job) send() }, 15000)
  return e
}

// Call from a form while it is open on a live day. `job` is
// { kind: 'match', team, match } or { kind: 'pit', team }, or null for nothing.
export function useAnnounceScouting(dayId, job) {
  const { username } = useUser()
  const jobKey = job && job.team ? `${job.kind}|${job.team}|${job.match || ''}` : ''
  useEffect(() => {
    if (!dayId || !username) return
    const e = entryFor(dayId, username)
    e.job = jobKey ? { ...job, since: new Date().toISOString() } : null
    e.send()
    return () => { if (days.get(dayId) === e) { e.job = null; e.send() } }
  }, [dayId, username, jobKey]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Call from the board. Returns [{ username, kind, team, match, since }].
export function useWhoIsScouting(dayId) {
  const { username } = useUser()
  const [who, setWho] = useState([])
  useEffect(() => {
    if (!dayId || !username) { setWho([]); return }
    const e = entryFor(dayId, username)
    e.listeners.add(setWho)
    setWho(e.state)
    return () => { e.listeners.delete(setWho) }
  }, [dayId, username])
  return who
}
