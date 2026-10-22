import { useState, useEffect, useCallback, useMemo } from 'react'
import { stampTeam, teamScope } from '../lib/teamScope'
import { dayProgress } from '../lib/dayRota'
import { announceLiveChange } from '../hooks/useLiveCompDay'
import { lazyHeadersWith, lazyRestHeaders, restHeaders } from '../lib/restHeaders'
import { AlertCircle, ArrowLeft, Calendar, ChevronRight, ClipboardCheck, Pause, Play, Plus, Shield, Trash2, Users, X } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { supabase } from '../supabase'
import NotificationBell from './NotificationBell'
import ScoutingDaySetup from './ScoutingDaySetup'
import PitChecklist from './PitChecklist'
import BagWatchTimer from './BagWatchTimer'
import BreakTimer from './BreakTimer'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const REST_HEADERS = lazyRestHeaders
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })
async function restGet(path) {
  const res = await fetch(`${REST_URL}/rest/v1/${path}`, { headers: REST_HEADERS })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
async function restPost(table, data) {
  const res = await fetch(`${REST_URL}/rest/v1/${table}`, { method: 'POST', headers: REST_JSON, body: JSON.stringify(data) })
  if (!res.ok) throw new Error(`POST ${table}: ${res.status} ${await res.text()}`)
}
async function restPatch(table, filter, data) {
  const res = await fetch(`${REST_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: REST_JSON, body: JSON.stringify(data) })
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status}`)
}
async function restDelete(table, filter) {
  await fetch(`${REST_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: REST_HEADERS })
}

const ROLES = [
  { id: 'scouting', label: 'Scouting', emoji: '🔍', color: 'bg-blue-100 text-blue-800 border-blue-300', bg: 'from-blue-200 to-blue-300', textColor: 'text-blue-800' },
  { id: 'pit-crew', label: 'Pit Crew', emoji: '🔧', color: 'bg-orange-100 text-orange-800 border-orange-300', bg: 'from-orange-200 to-orange-300', textColor: 'text-orange-800' },
  { id: 'drive-team', label: 'Drive Team', emoji: '🎮', color: 'bg-purple-100 text-purple-800 border-purple-300', bg: 'from-purple-200 to-purple-300', textColor: 'text-purple-800' },
  { id: 'spirit', label: 'Spirit', emoji: '📣', color: 'bg-pink-100 text-pink-800 border-pink-300', bg: 'from-pink-200 to-pink-300', textColor: 'text-pink-800' },
  { id: 'bag-watch', label: 'Bag Watch', emoji: '🎒', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', bg: 'from-yellow-200 to-yellow-300', textColor: 'text-yellow-800' },
  { id: 'break', label: 'Break', emoji: '☕', color: 'bg-gray-100 text-gray-600 border-gray-300', bg: 'from-gray-200 to-gray-300', textColor: 'text-gray-700' },
  { id: 'strategy', label: 'Strategy Lead', emoji: '🧠', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', bg: 'from-indigo-200 to-indigo-300', textColor: 'text-indigo-800' },
  { id: 'safety', label: 'Safety Monitor', emoji: '🦺', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', bg: 'from-emerald-200 to-emerald-300', textColor: 'text-emerald-800' },
]

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]))

export default function CompDayView({ onBack }) {
  const { username } = useUser()
  const { hasLeadTag, myTeamNumber } = usePermissions()

  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)  // currently open session
  const [blocks, setBlocks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scoutingRecords, setScoutingRecords] = useState([])

  // UI state
  const [newSessionName, setNewSessionName] = useState('')
  const [progress, setProgress] = useState({}) // session id -> { scouted, total }
  const [newBlockName, setNewBlockName] = useState('')
  const [assigningBlock, setAssigningBlock] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createStep, setCreateStep] = useState(1) // 1 = intro splash, 2 = name/details
  // Opening a competition day lands on the setup, because entering what the
  // day looks like is what you came to do. The role blocks are still a tab
  // along; they were never the first question.
  const [editorTab, setEditorTab] = useState('setup')
  const [compMatches, setCompMatches] = useState([])
  const [compTasks, setCompTasks] = useState([])
  const [blockTimes, setBlockTimes] = useState({})

  // Load stored matches/tasks/times when session changes
  const storageKey = `comp-day-${activeSession?.id}`
  const getStored = (key) => { try { return JSON.parse(localStorage.getItem(`${storageKey}-${key}`) || '[]') } catch { return [] } }
  const setStored = (key, val) => localStorage.setItem(`${storageKey}-${key}`, JSON.stringify(val))
  useEffect(() => {
    if (!activeSession) return
    const sk = `comp-day-${activeSession.id}`
    try { setCompMatches(JSON.parse(localStorage.getItem(`${sk}-matches`) || '[]')) } catch { setCompMatches([]) }
    try { setCompTasks(JSON.parse(localStorage.getItem(`${sk}-tasks`) || '[]')) } catch { setCompTasks([]) }
    try { setBlockTimes(JSON.parse(localStorage.getItem(`${sk}-times`) || '{}')) } catch { setBlockTimes({}) }
  }, [activeSession?.id])
  // The match list is what a scout's screen reads, so it cannot live only in
  // the lead's own browser. It was kept in localStorage, which meant a lead
  // could fill in the whole competition and no teammate would see a word of
  // it. Stored alongside the rest of the day's setup now; the local copy stays
  // so the tab still works offline and fills in instantly.
  const saveMatches = (m) => {
    setCompMatches(m)
    setStored('matches', m)
    if (!activeSession) return
    const docId = `day-comp-${activeSession.id}`
    ;(async () => {
      try {
        const url = import.meta.env.VITE_SUPABASE_URL
        const existing = await restGet(`scouting_schedule?id=eq.${docId}&select=data`)
        const data = { ...(existing?.[0]?.data || {}), matchSchedule: m }
        await fetch(`${url}/rest/v1/scouting_schedule`, {
          method: 'POST',
          headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(stampTeam({ id: docId, data }, myTeamNumber)),
        })
      } catch (err) { console.error('Could not share the match list:', err) }
    })()
  }
  const saveTasks = (t) => { setCompTasks(t); setStored('tasks', t) }
  const saveBlockTimes = (t) => { setBlockTimes(t); localStorage.setItem(`${storageKey}-times`, JSON.stringify(t)) }

  // Load all sessions
  const fetchSessions = useCallback(async () => {
    try {
      setError('')
      const all = await restGet('comp_day_sessions?order=created_at.desc&limit=20')
      setSessions(all)

      // How far each day has got: of the (team, match) pairs on its match
      // schedule, how many have a scouting row. This is what makes a paused
      // day resumable — the rows and the schedule are the record, so hosting
      // it again picks up exactly where it stopped.
      try {
        if (all.length) {
          const ids = all.map(s => `day-comp-${s.id}`)
          const [docs, recs] = await Promise.all([
            restGet(`scouting_schedule?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,data`),
            restGet(`match_scouting?${teamScope(myTeamNumber, 'owner_team')}&select=team_number,match_number`),
          ])
          const byId = {}
          docs.forEach(d => { byId[d.id] = d.data })
          const next = {}
          all.forEach(s => { next[s.id] = dayProgress(byId[`day-comp-${s.id}`], recs) })
          setProgress(next)
        }
      } catch { /* progress is a nicety; the list still works without it */ }

      // Load members list
      const profiles = await restGet('profiles?select=display_name,function_tags')
      setMembers(profiles.filter(p => !(p.function_tags || []).includes('Team')).map(p => p.display_name))
    } catch (err) {
      console.error('CompDay fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [myTeamNumber])

  // Load data for a specific session
  const fetchSessionData = useCallback(async (sessionId) => {
    if (!sessionId) return
    try {
      const today = new Date().toISOString().split('T')[0]
      const [blks, assigns, scoutRecs] = await Promise.all([
        restGet(`comp_day_blocks?session_id=eq.${sessionId}&order=order_index.asc`),
        restGet(`comp_day_assignments?session_id=eq.${sessionId}&select=*`),
        restGet(`scouting_records?submitted_at=gte.${today}T00:00:00&select=submitted_by,submitted_at`),
      ])
      setBlocks(blks)
      setAssignments(assigns)
      setScoutingRecords(scoutRecs)
    } catch (err) {
      console.error('Session data fetch error:', err)
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])
  useEffect(() => { if (activeSession) fetchSessionData(activeSession.id) }, [activeSession?.id, fetchSessionData])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('comp-day-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comp_day_sessions' }, () => fetchSessions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comp_day_blocks' }, () => { if (activeSession) fetchSessionData(activeSession.id) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comp_day_assignments' }, () => { if (activeSession) fetchSessionData(activeSession.id) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scouting_records' }, () => { if (activeSession) fetchSessionData(activeSession.id) })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchSessions, fetchSessionData, activeSession?.id])

  const activeBlock = useMemo(() => blocks.find(b => b.is_active), [blocks])
  const myRole = useMemo(() => {
    if (!activeBlock) return null
    const a = assignments.find(a => a.block_id === activeBlock.id && a.username === username)
    return a ? { ...ROLE_MAP[a.role], id: a.role } : null
  }, [activeBlock, assignments, username])

  const isLive = activeSession?.is_active

  // Actions
  const createSession = async () => {
    if (!newSessionName.trim()) return
    try {
      setError('')
      const id = 'comp_' + Date.now()
      await restPost('comp_day_sessions', {
        id, name: newSessionName.trim(),
        session_date: new Date().toISOString().split('T')[0],
        is_active: false, created_by: username,
      })
      setNewSessionName('')
      await fetchSessions()
      // Auto-open the new session
      const updated = await restGet('comp_day_sessions?order=created_at.desc&limit=1')
      // A day just created has nothing in it, so it opens where you fill it in.
      if (updated[0]) { setActiveSession(updated[0]); setEditorTab('setup') }
    } catch (err) { setError(err.message) }
  }

  const goLive = async () => {
    if (!activeSession) return
    try {
      setError('')
      await restPatch('comp_day_sessions', 'is_active=eq.true', { is_active: false })
      await restPatch('comp_day_sessions', `id=eq.${activeSession.id}`, { is_active: true })
      setActiveSession({ ...activeSession, is_active: true })
      announceLiveChange() // this app moves to the live scouting screen now
      await fetchSessions()
    } catch (err) { setError(err.message) }
  }

  const endSession = async () => {
    if (!activeSession) return
    try {
      setError('')
      await restPatch('comp_day_sessions', `id=eq.${activeSession.id}`, { is_active: false })
      setActiveSession({ ...activeSession, is_active: false })
      announceLiveChange()
      await fetchSessions()
    } catch (err) { setError(err.message) }
  }

  // Host a paused or planned day from its card: it goes live for everyone and
  // opens here. Any other live day is paused first; there is only ever one.
  const hostSession = async (s) => {
    try {
      setError('')
      await restPatch('comp_day_sessions', 'is_active=eq.true', { is_active: false })
      await restPatch('comp_day_sessions', `id=eq.${s.id}`, { is_active: true })
      setActiveSession({ ...s, is_active: true }); setAssigningBlock(null); setEditorTab('setup')
      announceLiveChange()
      await fetchSessions()
    } catch (err) { setError(err.message) }
  }

  const renameSession = async (name) => {
    if (!activeSession || !name.trim()) return
    try {
      setError('')
      await restPatch('comp_day_sessions', `id=eq.${activeSession.id}`, { name: name.trim() })
      setActiveSession({ ...activeSession, name: name.trim() })
      await fetchSessions()
    } catch (err) { setError(err.message) }
  }

  const deleteSession = async (sid) => {
    try {
      setError('')
      await restDelete('comp_day_sessions', `id=eq.${sid}`)
      announceLiveChange()
      if (activeSession?.id === sid) { setActiveSession(null); setBlocks([]); setAssignments([]) }
      await fetchSessions()
    } catch (err) { setError(err.message) }
  }

  const addBlock = async () => {
    if (!newBlockName.trim() || !activeSession) return
    try {
      setError('')
      await restPost('comp_day_blocks', {
        id: 'block_' + Date.now(), session_id: activeSession.id,
        name: newBlockName.trim(), order_index: blocks.length, is_active: false,
      })
      setNewBlockName('')
      await fetchSessionData(activeSession.id)
    } catch (err) { setError(err.message) }
  }

  const activateBlock = async (blockId) => {
    try {
      setError('')
      await restPatch('comp_day_blocks', `session_id=eq.${activeSession.id}`, { is_active: false })
      await restPatch('comp_day_blocks', `id=eq.${blockId}`, { is_active: true })
      await fetchSessionData(activeSession.id)
    } catch (err) { setError(err.message) }
  }

  const deleteBlock = async (blockId) => {
    try { await restDelete('comp_day_blocks', `id=eq.${blockId}`); await fetchSessionData(activeSession.id) }
    catch (err) { setError(err.message) }
  }

  const setRole = async (blockId, memberName, role) => {
    try {
      await restDelete('comp_day_assignments', `block_id=eq.${blockId}&username=eq.${encodeURIComponent(memberName)}`)
      if (role) {
        await restPost('comp_day_assignments', {
          id: 'assign_' + Date.now() + Math.random().toString(36).slice(2),
          block_id: blockId, session_id: activeSession.id, username: memberName, role,
        })
      }
      await fetchSessionData(activeSession.id)
    } catch (err) { setError(err.message) }
  }

  const getBlockAssignments = (blockId) => assignments.filter(a => a.block_id === blockId)
  const getMemberRole = (blockId, memberName) => {
    const a = assignments.find(a => a.block_id === blockId && a.username === memberName)
    return a?.role || ''
  }
  const unassignedInBlock = (blockId) => {
    const assigned = assignments.filter(a => a.block_id === blockId).map(a => a.username)
    return members.filter(m => !assigned.includes(m))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  }

  // ─── Member View ───
  if (!hasLeadTag) {
    const liveSession = sessions.find(s => s.is_active)
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
          <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">Competition Day</h1>
              <p className="text-sm text-gray-400">{liveSession ? liveSession.name : 'No active competition'}</p>
            </div>
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-lg mx-auto space-y-4">
            {!liveSession ? (
              <div className="text-center py-16">
                <p className="text-6xl mb-4">🏁</p>
                <h2 className="text-xl font-bold text-gray-700">No Active Competition</h2>
                <p className="text-gray-400 mt-2">A lead will activate Comp Day when it's time.</p>
              </div>
            ) : (
              <>
                {activeBlock && (
                  <div className="text-center mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE — {activeBlock.name}
                    </span>
                  </div>
                )}

                {activeBlock && myRole ? (
                  <div className={`rounded-2xl bg-gradient-to-br ${myRole.bg} p-8 text-center shadow-lg border border-gray-200`}>
                    <p className="text-6xl mb-3">{myRole.emoji}</p>
                    <h1 className={`text-3xl font-black ${myRole.textColor || 'text-gray-800'}`}>{myRole.label}</h1>
                    <p className="text-gray-500 mt-2 text-sm">This is your current assignment</p>
                  </div>
                ) : activeBlock ? (
                  <div className="rounded-2xl bg-gray-100 p-8 text-center">
                    <p className="text-4xl mb-2">❓</p>
                    <h2 className="text-xl font-bold text-gray-600">No Role Assigned</h2>
                    <p className="text-gray-400 mt-1">Ask a lead for your assignment.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-gray-50 p-8 text-center">
                    <p className="text-4xl mb-2">⏳</p>
                    <h2 className="text-xl font-bold text-gray-600">Waiting</h2>
                    <p className="text-gray-400 mt-1">No block is active yet.</p>
                  </div>
                )}

                {/* Role-specific tools */}
                {activeBlock && myRole && (
                  <div className="space-y-3">
                    {myRole.id === 'scouting' && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">📊 Scouting Tools</h3>
                        <p className="text-sm text-gray-500 mb-3">Focus on watching the field and recording data.</p>
                        <button
                          onClick={() => {/* This will be handled by parent via tab change */}}
                          className="w-full py-2.5 rounded-xl font-semibold text-gray-700 bg-brand-blue hover:bg-brand-blue-dark transition-colors text-sm"
                        >
                          Open Scouting Form
                        </button>
                      </div>
                    )}
                    {myRole.id === 'drive-team' && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">🎮 Drive Team</h3>
                        <p className="text-sm text-gray-500">Coordinate strategy with your alliance in the chat.</p>
                      </div>
                    )}
                    {myRole.id === 'pit-crew' && <PitChecklist />}
                    {myRole.id === 'spirit' && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">📣 Spirit Squad</h3>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-50 border border-pink-200">
                            <span className="text-lg">📢</span>
                            <span className="text-sm text-gray-700">Cheer loud for our team during matches!</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200">
                            <span className="text-lg">👏</span>
                            <span className="text-sm text-gray-700">Support the drive team — they can hear you!</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                            <span className="text-lg">🤝</span>
                            <span className="text-sm text-gray-700">Be friendly to other teams — Gracious Professionalism!</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {myRole.id === 'bag-watch' && <BagWatchTimer />}
                    {myRole.id === 'break' && <BreakTimer />}
                    {myRole.id === 'strategy' && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">🧠 Strategy Lead</h3>
                        <p className="text-sm text-gray-500 mb-3">Analyze scouting data and plan match strategy.</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                            <span className="text-sm text-gray-700">Review scouting data in the Data tab</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                            <span className="text-sm text-gray-700">Discuss strategy in Alliance Chat</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {myRole.id === 'safety' && (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">🦺 Safety Monitor</h3>
                        <div className="space-y-2">
                          {['Safety glasses on in pit', 'No loose clothing near machinery', 'Tools returned after use', 'Pit area clean and organized', 'First aid kit accessible'].map((item, i) => (
                            <label key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 cursor-pointer">
                              <input type="checkbox" className="rounded" />
                              <span className="text-sm text-gray-700">{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {blocks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">Your Schedule</h3>
                    <div className="space-y-2">
                      {blocks.map(b => {
                        const role = getMemberRole(b.id, username)
                        const roleInfo = ROLE_MAP[role]
                        return (
                          <div key={b.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${b.is_active ? 'bg-brand-blue/20 border-brand-blue-dark' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-2">
                              {b.is_active && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                              <span className={`text-sm font-medium ${b.is_active ? 'text-gray-800' : 'text-gray-600'}`}>{b.name}</span>
                            </div>
                            {roleInfo ? (
                              <span className={`text-xs px-2 py-1 rounded-full border ${roleInfo.color}`}>
                                {roleInfo.emoji} {roleInfo.label}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    )
  }

  // ─── Lead View: Landing page (no session open) ───
  if (!activeSession) {
    const liveSessions = sessions.filter(s => s.is_active)
    const draftSessions = sessions.filter(s => !s.is_active)
    const progressText = (s) => {
      const p = progress[s.id]
      if (!p || !p.total) return ''
      return ` · ${p.scouted}/${p.total} scouted${!s.is_active && p.scouted ? ' · paused' : ''}`
    }

    return (
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
          <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
            <div className="flex items-center gap-3 text-gray-200">
              <button onClick={onBack} className="p-1 rounded hover:bg-gray-800 text-gray-300 hover:text-gray-100 transition-colors">
                <ArrowLeft size={18} />
              </button>
              <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">Competition Day</h1>
            </div>
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* What a scout's screen needs before it can say anything useful:
                which teams play each match, which group covers it, who scouts
                each position.
                
                This is the setup editor itself rather than a link to it — the
                question "what do my teammates see" is asked here, so it is
                answered here. The same component as the Schedule tab, opened on
                its Match Schedule page, writing the same document, so there is
                one editor and not two drifting copies. Keyed to the session, so
                each competition keeps its own. */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 flex-1 break-all">{error}</p>
                <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs">dismiss</button>
              </div>
            )}

            {/* Live sessions */}
            {liveSessions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live Now
                </h3>
                <div className="space-y-2">
                  {liveSessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setActiveSession(s); setAssigningBlock(null); setEditorTab('setup') }}
                      className="w-full flex items-center justify-between px-5 py-4 bg-green-50 border-2 border-green-300 rounded-xl hover:bg-green-100 transition-colors text-left"
                    >
                      <div>
                        <p className="font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.session_date} &middot; Created by {s.created_by}{progressText(s)}</p>
                      </div>
                      <ChevronRight size={18} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Draft plans */}
            {draftSessions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Paused &amp; planned · host any of these again</h3>
                <div className="space-y-2">
                  {draftSessions.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <button
                        onClick={() => { setActiveSession(s); setAssigningBlock(null); setEditorTab('setup') }}
                        className="flex-1 flex items-center justify-between px-5 py-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.session_date} &middot; Created by {s.created_by}{progressText(s)}</p>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                      </button>
                      <button onClick={() => hostSession(s)} className="p-2 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Host this day — everyone's app opens on it and scouting carries on where it stopped">
                        <Play size={16} />
                      </button>
                      <button onClick={() => deleteSession(s.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Delete plan">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Competition Day button */}
            <button
              onClick={() => { setShowCreate(true); setCreateStep(1) }}
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-yellow hover:bg-brand-yellow/10 transition-colors text-gray-500 hover:text-gray-700"
            >
              <Plus size={18} />
              <span className="font-medium">New Competition Day</span>
            </button>

            {/* Empty state */}
            {sessions.length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">No competition days planned yet.</p>
                <p className="text-gray-300 text-xs mt-1">Tap above to create your first plan.</p>
              </div>
            )}
          </div>
        </main>

        {/* ─── Create Modal: Step 1 = Intro, Step 2 = Details ─── */}
        {showCreate && (
          <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowCreate(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden animate-bounce-in" onClick={e => e.stopPropagation()}>

                {/* Step 1: Intro splash */}
                {createStep === 1 && (
                  <div className="p-8 text-center">
                    <p className="text-6xl mb-4">🏁</p>
                    <h2 className="text-2xl font-black text-gray-800 mb-2">Competition Day</h2>
                    <p className="text-gray-500 mb-1">Assign roles. Lock screens.</p>
                    <p className="text-gray-500 mb-1">Track accountability.</p>
                    <p className="text-gray-400 text-sm mt-2 mb-6">Every member knows exactly what to do.</p>
                    <button
                      onClick={() => setCreateStep(2)}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-yellow to-brand-silver text-gray-800 font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
                    >
                      Let's Get Started
                    </button>
                  </div>
                )}

                {/* Step 2: Name & create */}
                {createStep === 2 && (
                  <>
                    <div className="border-b px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCreateStep(1)} className="p-1 hover:bg-gray-100 rounded-lg">
                          <ArrowLeft size={16} className="text-gray-400" />
                        </button>
                        <h2 className="text-lg font-bold text-gray-800">New Competition Day</h2>
                      </div>
                      <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                        <X size={18} className="text-gray-400" />
                      </button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Competition Name</label>
                        <input
                          type="text"
                          value={newSessionName}
                          onChange={e => setNewSessionName(e.target.value)}
                          placeholder="e.g. States Day 1, Qualifier Round 2"
                          className="w-full mt-1.5 border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                          onKeyDown={e => e.key === 'Enter' && newSessionName.trim() && createSession()}
                          autoFocus
                        />
                      </div>
                      <button
                        onClick={() => { createSession(); setShowCreate(false) }}
                        disabled={!newSessionName.trim()}
                        className="w-full py-3 rounded-xl bg-brand-yellow text-gray-800 font-semibold disabled:opacity-40 hover:bg-brand-yellow-dark transition-colors"
                      >
                        Create Plan
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── Lead View: Session editor with tabbed nav ───

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
          <div className="flex items-center gap-3 text-gray-200">
            <button onClick={() => setActiveSession(null)} className="p-1 rounded hover:bg-gray-800 text-gray-300 hover:text-gray-100 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-gray-200">
                <h1 className="text-lg font-bold text-gray-100">{activeSession.name}</h1>
                {isLive ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 font-bold tracking-wider">LIVE</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-300 font-medium">DRAFT</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{activeSession.session_date}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            {!isLive ? (
              <button onClick={goLive} className="px-4 py-1.5 rounded-lg bg-green-100 text-green-700 border border-green-300 text-sm font-semibold hover:bg-green-200 transition-colors">
                Go Live
              </button>
            ) : (
              <button onClick={endSession} title="Pause this day — everyone's app goes back to normal; host it again any time to carry on" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-50 text-red-500 border border-red-200 text-sm font-semibold hover:bg-red-100 transition-colors">
                <Pause size={14} /> Pause
              </button>
            )}
            <NotificationBell />
          </div>
        </div>

      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 flex-1 break-all">{error}</p>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs">dismiss</button>
            </div>
          )}

          {/* Opening a competition day IS this editor. There was a row of
              seven tabs above it — Roles, Schedule, Matches, Rotation, Tasks,
              Team Status — and they are deliberately gone: everything a lead
              sets up for a day is entered here, in one place, and the row was
              seven ways to be somewhere else.

              The blocks for those tabs are still below, each behind an
              editorTab test that nothing sets any more, so bringing one back
              is adding its button rather than writing it again. */}
          {editorTab === 'setup' && (
            <ScoutingDaySetup
              scheduleId={`day-comp-${activeSession.id}`}
              dateTitle={activeSession.name || 'Competition Day'}
              dateSubtitle="What everyone sees on the day"
              onBack={() => setActiveSession(null)}
              onRename={renameSession}
            />
          )}

          {editorTab === 'roles' && (
            <div className="space-y-4">
              {blocks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">Add schedule blocks first (📅 Schedule tab), then assign roles here.</p>
                </div>
              ) : (
                <>
                  {/* Block selector for role assignment */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {blocks.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setAssigningBlock(b.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                          assigningBlock === b.id ? 'bg-brand-blue text-gray-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {b.is_active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />}
                        {b.name}
                      </button>
                    ))}
                  </div>

                  {/* Role cards grouped by role */}
                  {assigningBlock && (
                    <div className="space-y-3">
                      {ROLES.map(role => {
                        const assigned = assignments.filter(a => a.block_id === assigningBlock && a.role === role.id)
                        return (
                          <div key={role.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden`}>
                            <div className={`px-4 py-3 flex items-center justify-between ${role.color} border-b`}>
                              <span className="text-sm font-semibold">{role.emoji} {role.label}</span>
                              <span className="text-xs">{assigned.length} assigned</span>
                            </div>
                            <div className="p-3">
                              {/* Assigned members */}
                              {assigned.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {assigned.map(a => (
                                    <span key={a.username} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                                      {a.username}
                                      {hasLeadTag && (
                                        <button onClick={() => setRole(assigningBlock, a.username, '')} className="text-gray-400 hover:text-red-500">
                                          <X size={12} />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Add member dropdown */}
                              {hasLeadTag && (
                                <select
                                  className="text-xs border rounded-lg px-2 py-1.5 text-gray-500 w-full"
                                  value=""
                                  onChange={e => { if (e.target.value) setRole(assigningBlock, e.target.value, role.id) }}
                                >
                                  <option value="">+ Add person...</option>
                                  {members.filter(m => !assigned.some(a => a.username === m)).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              )}
                              {assigned.length === 0 && !hasLeadTag && (
                                <p className="text-xs text-gray-400">No one assigned</p>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Unassigned */}
                      {(() => {
                        const unassigned = unassignedInBlock(assigningBlock)
                        if (unassigned.length === 0) return null
                        return (
                          <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
                            <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
                              <span className="text-sm font-semibold text-red-600">❓ Unassigned</span>
                              <span className="text-xs text-red-500">{unassigned.length} members</span>
                            </div>
                            <div className="p-3 flex flex-wrap gap-1.5">
                              {unassigned.map(m => (
                                <span key={m} className="text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-full">{m}</span>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {!assigningBlock && (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-sm">Select a block above to assign roles.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ SCHEDULE TAB ═══ */}
          {editorTab === 'schedule' && (
            <div className="space-y-4">
              {/* Add block */}
              {hasLeadTag && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBlockName}
                    onChange={e => setNewBlockName(e.target.value)}
                    placeholder="Add block (e.g. Qual Match 1, Lunch, Judging)"
                    className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    onKeyDown={e => e.key === 'Enter' && addBlock()}
                  />
                  <button onClick={addBlock} disabled={!newBlockName.trim()} className="px-4 py-2.5 rounded-lg bg-brand-yellow text-gray-800 text-sm font-medium disabled:opacity-40 hover:bg-brand-yellow-dark transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              )}

              {blocks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No schedule blocks yet.</p>
                  <p className="text-xs mt-1">Add blocks like Opening Matches, Lunch, Judging, Finals...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block, idx) => {
                    const times = blockTimes[block.id] || {}
                    return (
                      <div key={block.id} className={`bg-white rounded-xl shadow-sm border p-4 ${block.is_active ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {block.is_active && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                            <span className="font-semibold text-gray-800">{block.name}</span>
                            <span className="text-xs text-gray-400">Block {idx + 1}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isLive && !block.is_active && (
                              <button onClick={() => activateBlock(block.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Activate">
                                <Play size={14} />
                              </button>
                            )}
                            {isLive && block.is_active && (
                              <button onClick={() => restPatch('comp_day_blocks', `id=eq.${block.id}`, { is_active: false }).then(() => fetchSessionData(activeSession.id))} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors" title="Deactivate">
                                <Pause size={14} />
                              </button>
                            )}
                            {hasLeadTag && (
                              <button onClick={() => deleteBlock(block.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Delete">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Time inputs */}
                        {hasLeadTag && (
                          <div className="flex gap-3 mt-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-400 uppercase">Start</span>
                              <input
                                type="time"
                                value={times.start || ''}
                                onChange={e => saveBlockTimes({ ...blockTimes, [block.id]: { ...times, start: e.target.value } })}
                                className="text-xs border rounded px-2 py-1 text-gray-600"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-400 uppercase">End</span>
                              <input
                                type="time"
                                value={times.end || ''}
                                onChange={e => saveBlockTimes({ ...blockTimes, [block.id]: { ...times, end: e.target.value } })}
                                className="text-xs border rounded px-2 py-1 text-gray-600"
                              />
                            </div>
                          </div>
                        )}
                        {!hasLeadTag && times.start && (
                          <p className="text-xs text-gray-400 mt-1">{times.start}{times.end ? ` – ${times.end}` : ''}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ MATCHES TAB ═══ */}
          {editorTab === 'matches' && (
            <div className="space-y-4">
              {hasLeadTag && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Match # (e.g. Q12, SF1-1)"
                    id="match-num"
                    className="w-24 border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <input
                    type="time"
                    id="match-time"
                    className="border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Red 1"
                    id="match-red1"
                    className="w-20 border rounded-lg px-2 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Red 2"
                    id="match-red2"
                    className="w-20 border rounded-lg px-2 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Blue 1"
                    id="match-blue1"
                    className="w-20 border rounded-lg px-2 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Blue 2"
                    id="match-blue2"
                    className="w-20 border rounded-lg px-2 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    id="match-notes"
                    className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                  />
                  <button
                    onClick={() => {
                      const val = (id) => (document.getElementById(id)?.value || '').trim()
                      const num = val('match-num')
                      if (!num) return
                      const updated = [...compMatches, {
                        id: Date.now(), number: num,
                        time: document.getElementById('match-time').value,
                        notes: val('match-notes'),
                        // Who is playing. This is what lets a scout's screen
                        // name the team instead of only the match.
                        red1: val('match-red1'), red2: val('match-red2'),
                        blue1: val('match-blue1'), blue2: val('match-blue2'),
                      }]
                      saveMatches(updated)
                      ;['match-num','match-time','match-notes','match-red1','match-red2','match-blue1','match-blue2']
                        .forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
                    }}
                    className="px-4 py-2.5 rounded-lg bg-brand-yellow text-gray-800 text-sm font-medium hover:bg-brand-yellow-dark transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}

              {compMatches.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No matches added yet.</p>
                  <p className="text-xs mt-1">Add your team's match numbers and times.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {compMatches.map((match, idx) => (
                    <div key={match.id} className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-800">{match.number}</span>
                        {match.time && <span className="text-sm text-gray-500">{match.time}</span>}
                        {(match.red1 || match.red2 || match.blue1 || match.blue2) && (
                          <span className="flex items-center gap-1">
                            {[match.red1, match.red2].filter(Boolean).map(t => (
                              <span key={`r${t}`} className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700">{t}</span>
                            ))}
                            {[match.blue1, match.blue2].filter(Boolean).map(t => (
                              <span key={`b${t}`} className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{t}</span>
                            ))}
                          </span>
                        )}
                        {match.notes && <span className="text-xs text-gray-400">— {match.notes}</span>}
                      </div>
                      {hasLeadTag && (
                        <button onClick={() => saveMatches(compMatches.filter(m => m.id !== match.id))} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ ROTATION TAB ═══ */}
          {editorTab === 'rotation' && (
            <div className="space-y-4">
              {blocks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">Add schedule blocks first to see rotations.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map(member => {
                    const memberRoles = blocks.map(b => {
                      const role = getMemberRole(b.id, member)
                      return { block: b.name, blockId: b.id, role, isActive: b.is_active }
                    })
                    const currentIdx = memberRoles.findIndex(r => r.isActive)
                    const currentRole = currentIdx >= 0 ? memberRoles[currentIdx] : null
                    const nextRole = currentIdx >= 0 && currentIdx < memberRoles.length - 1 ? memberRoles[currentIdx + 1] : null

                    return (
                      <div key={member} className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold text-gray-800">{member}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {memberRoles.map((mr, idx) => {
                            const roleInfo = ROLE_MAP[mr.role]
                            return (
                              <div key={mr.blockId} className="flex items-center gap-1">
                                {idx > 0 && <ChevronRight size={12} className="text-gray-300" />}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                  mr.isActive ? (roleInfo ? roleInfo.color : 'bg-red-50 text-red-500 border-red-200') + ' ring-2 ring-green-200' :
                                  roleInfo ? roleInfo.color : 'bg-gray-100 text-gray-400 border-gray-200'
                                }`}>
                                  {roleInfo ? `${roleInfo.emoji} ${roleInfo.label}` : '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        {currentRole && (
                          <p className="text-[10px] text-gray-400 mt-1.5">
                            Now: {ROLE_MAP[currentRole.role]?.label || 'Unassigned'}
                            {nextRole && ` → Next: ${ROLE_MAP[nextRole.role]?.label || 'Unassigned'}`}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ TASKS TAB ═══ */}
          {editorTab === 'tasks' && (
            <div className="space-y-4">
              {hasLeadTag && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Task (e.g. Charge batteries, Fix intake)"
                    id="comp-task-title"
                    className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const title = e.target.value.trim()
                        if (!title) return
                        saveTasks([...compTasks, { id: Date.now(), title, assignee: '', done: false }])
                        e.target.value = ''
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById('comp-task-title')
                      const title = el.value.trim()
                      if (!title) return
                      saveTasks([...compTasks, { id: Date.now(), title, assignee: '', done: false }])
                      el.value = ''
                    }}
                    className="px-4 py-2.5 rounded-lg bg-brand-yellow text-gray-800 text-sm font-medium hover:bg-brand-yellow-dark transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}

              {compTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No competition tasks yet.</p>
                  <p className="text-xs mt-1">Add tasks like charging batteries, fixing parts, scouting teams...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {compTasks.map(task => (
                    <div key={task.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 flex items-center gap-3 ${task.done ? 'opacity-60' : ''}`}>
                      <button
                        onClick={() => saveTasks(compTasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t))}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          task.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {task.done && <span className="text-[10px]">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
                        {task.assignee && <p className="text-xs text-gray-400">{task.assignee}</p>}
                      </div>
                      {hasLeadTag && (
                        <div className="flex items-center gap-1">
                          <select
                            value={task.assignee}
                            onChange={e => saveTasks(compTasks.map(t => t.id === task.id ? { ...t, assignee: e.target.value } : t))}
                            className="text-xs border rounded px-1.5 py-1 text-gray-500 max-w-[100px]"
                          >
                            <option value="">Assign...</option>
                            {members.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <button onClick={() => saveTasks(compTasks.filter(t => t.id !== task.id))} className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ TEAM STATUS TAB ═══ */}
          {editorTab === 'status' && (
            <div className="space-y-4">
              {/* Scouting accountability */}
              {(() => {
                const scoutAssigns = assignments.filter(a => a.role === 'scouting')
                const scoutMembers = [...new Set(scoutAssigns.map(a => a.username))]
                if (scoutMembers.length === 0) return null
                const scoutBlockCount = {}
                scoutMembers.forEach(m => { scoutBlockCount[m] = scoutAssigns.filter(a => a.username === m).length })
                const submissionCount = {}
                scoutingRecords.forEach(r => { submissionCount[r.submitted_by] = (submissionCount[r.submitted_by] || 0) + 1 })
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <ClipboardCheck size={16} className="text-blue-500" />
                      Scouting Accountability
                    </h3>
                    <div className="space-y-1.5">
                      {scoutMembers.map(member => {
                        const assigned = scoutBlockCount[member] || 0
                        const submitted = submissionCount[member] || 0
                        const ok = submitted >= assigned
                        return (
                          <div key={member} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                            <span className="text-sm font-medium text-gray-700">{member}</span>
                            <span className={`text-xs font-semibold ${ok ? 'text-green-600' : 'text-red-600'}`}>{submitted}/{assigned} {ok ? '✅' : '⚠️'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Everyone's current role */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  👥 Current Assignments
                  {activeBlock && <span className="text-xs font-normal text-gray-400">— {activeBlock.name}</span>}
                </h3>
                {!activeBlock ? (
                  <p className="text-sm text-gray-400">No active block. Activate a block in the Schedule tab to see live status.</p>
                ) : (
                  <div className="space-y-1.5">
                    {members.map(member => {
                      const role = getMemberRole(activeBlock.id, member)
                      const roleInfo = ROLE_MAP[role]
                      return (
                        <div key={member} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                          <span className="text-sm font-medium text-gray-700">{member}</span>
                          {roleInfo ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${roleInfo.color}`}>
                              {roleInfo.emoji} {roleInfo.label}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Unassigned</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
