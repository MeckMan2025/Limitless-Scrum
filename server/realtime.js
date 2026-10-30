// Live updates: the part of Supabase Realtime the app uses, at
// /realtime/v1/websocket.
//
// The app subscribes with supabase.channel(...).on('postgres_changes', ...)
// and .on('presence', ...). supabase-js speaks the Phoenix channel protocol
// over a websocket; this answers it. Every write goes through this server
// (rest.js, admin.js), which calls publish() after it commits, so there is no
// need to read PostgreSQL's change stream: a change made on one computer
// reaches every other one that is listening.
//
// Messages are [join_ref, ref, topic, event, payload] (protocol 2.0.0) or the
// same as an object (1.0.0); a socket is answered in the shape it speaks.
//
// A socket that has not shown a valid sign-in token may join channels (the app
// joins some before sign-in) but is sent no changes and no presence.

import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { filterRows } from '../src/lib/restQuery.js'
import { verifyJwt } from './auth.js'

const sockets = new Set()
const presence = new Map() // topic -> Map(socket -> { key, ref, meta })
let nextBindingId = 1
let nextPresenceRef = 1

export function attachRealtime(server, wsPath) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname !== wsPath) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const s = {
        ws, vsn: url.searchParams.get('vsn') || '1.0.0',
        claims: null, channels: new Map(), alive: true,
      }
      sockets.add(s)
      ws.on('message', (data) => { onMessage(s, String(data)).catch(() => {}) })
      ws.on('pong', () => { s.alive = true })
      ws.on('close', () => {
        sockets.delete(s)
        for (const topic of s.channels.keys()) leavePresence(s, topic)
      })
    })
  })
  // Drop sockets whose browser went away without saying so.
  const timer = setInterval(() => {
    for (const s of sockets) {
      if (!s.alive) { s.ws.terminate(); continue }
      s.alive = false
      try { s.ws.ping() } catch { /* closing */ }
    }
  }, 30000)
  timer.unref()
}

function send(s, joinRef, ref, topic, event, payload) {
  if (s.ws.readyState !== 1) return
  const msg = s.vsn === '2.0.0'
    ? JSON.stringify([joinRef ?? null, ref ?? null, topic, event, payload])
    : JSON.stringify({ join_ref: joinRef ?? null, ref: ref ?? null, topic, event, payload })
  s.ws.send(msg)
}

const reply = (s, joinRef, ref, topic, response = {}, status = 'ok') =>
  send(s, joinRef, ref, topic, 'phx_reply', { status, response })

async function authenticate(s, token) {
  if (!token) return
  const claims = await verifyJwt(token)
  if (claims) s.claims = claims
}

async function onMessage(s, text) {
  let msg
  try { msg = JSON.parse(text) } catch { return }
  const [joinRef, ref, topic, event, payload] = Array.isArray(msg)
    ? msg
    : [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload]

  if (topic === 'phoenix' && event === 'heartbeat') return reply(s, null, ref, 'phoenix')

  if (event === 'phx_join') {
    await authenticate(s, payload?.access_token)
    const config = payload?.config || {}
    const bindings = (config.postgres_changes || []).map((b) => ({
      id: nextBindingId++, event: b.event, schema: b.schema, table: b.table, filter: b.filter,
    }))
    if (s.channels.has(topic)) leavePresence(s, topic)
    s.channels.set(topic, {
      joinRef, bindings,
      presenceKey: config.presence?.key || randomUUID(),
      presenceOn: !!config.presence?.enabled,
    })
    reply(s, joinRef, ref, topic, { postgres_changes: bindings })
    if (config.presence?.enabled) sendPresenceState(s, topic)
    return
  }

  const ch = s.channels.get(topic)

  if (event === 'access_token') {
    await authenticate(s, payload?.access_token)
    return reply(s, joinRef, ref, topic)
  }

  if (event === 'phx_leave') {
    leavePresence(s, topic)
    s.channels.delete(topic)
    reply(s, joinRef, ref, topic)
    return send(s, joinRef, null, topic, 'phx_close', {})
  }

  if (event === 'presence' && ch) {
    if (payload?.event === 'track' && s.claims) trackPresence(s, topic, ch, payload.payload || {})
    if (payload?.event === 'untrack') leavePresence(s, topic)
    return reply(s, joinRef, ref, topic)
  }

  if (event === 'broadcast' && ch && s.claims) {
    for (const other of sockets) {
      if (other === s || !other.claims) continue
      const och = other.channels.get(topic)
      if (och) send(other, och.joinRef, null, topic, 'broadcast', payload)
    }
    return reply(s, joinRef, ref, topic)
  }

  if (ref != null) reply(s, joinRef, ref, topic)
}

// ---- postgres_changes ----------------------------------------------------------

const matches = (b, table, type, row) => {
  if (b.schema && b.schema !== '*' && b.schema !== 'public') return false
  if (b.table && b.table !== '*' && b.table !== table) return false
  if (b.event && b.event !== '*' && b.event.toUpperCase() !== type) return false
  if (b.filter) {
    // 'col=op.value', the same language as a REST filter.
    const i = b.filter.indexOf('=')
    if (i < 0) return true
    const params = new URLSearchParams()
    params.set(b.filter.slice(0, i), b.filter.slice(i + 1))
    return filterRows([row || {}], params).length === 1
  }
  return true
}

// Tell every listener about committed changes:
// [{ table, type: 'INSERT'|'UPDATE'|'DELETE', record, old_record }].
export function publish(changes) {
  if (!changes?.length || !sockets.size) return
  const commit_timestamp = new Date().toISOString()
  for (const c of changes) {
    for (const s of sockets) {
      if (!s.claims) continue
      for (const [topic, ch] of s.channels) {
        const row = c.type === 'DELETE' ? c.old_record : c.record
        const ids = ch.bindings.filter((b) => matches(b, c.table, c.type, row)).map((b) => b.id)
        if (!ids.length) continue
        send(s, ch.joinRef, null, topic, 'postgres_changes', {
          ids,
          data: {
            schema: 'public', table: c.table, commit_timestamp, type: c.type, columns: [],
            record: c.type === 'DELETE' ? {} : c.record,
            old_record: c.type === 'INSERT' ? {} : (c.old_record || {}),
            errors: null,
          },
        })
      }
    }
  }
}

// ---- presence ------------------------------------------------------------------

const members = (topic) => presence.get(topic) || new Map()

function sendPresenceState(s, topic) {
  if (!s.claims) return
  const state = {}
  for (const { key, ref, meta } of members(topic).values()) {
    (state[key] ||= { metas: [] }).metas.push({ phx_ref: ref, ...meta })
  }
  const ch = s.channels.get(topic)
  send(s, ch?.joinRef, null, topic, 'presence_state', state)
}

function presenceDiff(topic, joins, leaves) {
  for (const s of sockets) {
    const ch = s.channels.get(topic)
    if (!ch || !s.claims) continue
    send(s, ch.joinRef, null, topic, 'presence_diff', { joins, leaves })
  }
}

function trackPresence(s, topic, ch, meta) {
  leavePresence(s, topic)
  const entry = { key: ch.presenceKey, ref: String(nextPresenceRef++), meta }
  if (!presence.has(topic)) presence.set(topic, new Map())
  presence.get(topic).set(s, entry)
  presenceDiff(topic, { [entry.key]: { metas: [{ phx_ref: entry.ref, ...meta }] } }, {})
}

function leavePresence(s, topic) {
  const m = presence.get(topic)
  const entry = m?.get(s)
  if (!entry) return
  m.delete(s)
  if (!m.size) presence.delete(topic)
  presenceDiff(topic, {}, { [entry.key]: { metas: [{ phx_ref: entry.ref, ...entry.meta }] } })
}
