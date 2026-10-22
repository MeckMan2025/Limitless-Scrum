import MemberPicker from './MemberPicker'
import { useMemberNames } from '../hooks/useMemberNames'
import { onlyMyTeam, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { Check, ChevronLeft, ClipboardList, Pause, Pencil, Plus, Shuffle, Star, Target, Tent, Trash2, Wrench } from 'lucide-react'
import { ALL_TEAMS } from '../data/teams'
import { SCOUTING_ROLE, PIT_ROLE } from '../lib/dayRota'

// ---- Default data (from the team's scouting spreadsheet) -------------------
// What a fresh day starts as.
//
// Structure only — the groups, the jobs that need covering, the shape of a
// scouting rotation — and no names. There used to be twenty-nine people in
// here, copied from the spreadsheet the season it was written: fourteen of
// them have since left the app entirely and three moved to another team, so
// every new day began by offering a lead a rota of people who are not there.
//
// A hard-coded roster is wrong the moment somebody joins or leaves, and it is
// wrong quietly. Leads pick real people from the real roster instead.
// Event roles that used to be offered and are not any more.
const RETIRED_ROLES = ['Observation']

const DEFAULT_DATA = {
  fixedRoles: [
    { role: 'Drive Team', members: [] },
    { role: 'Pit Crew', members: [] },
    { role: 'Media', members: [] },
    { role: SCOUTING_ROLE, members: [] },
    { role: PIT_ROLE, members: [] },
  ],
  // Teams that get a pit visit, and who makes it: { id, team, who }.
  pitTeams: [],
  scoutGroups: [
    { id: 's1', name: 'Group 1', head: '', red1: '', red2: '', blue1: '', blue2: '' },
  ],
  standBy: '',
  matchSchedule: [
    { id: 'ms1', match: '1', red1: '', red2: '', blue1: '', blue2: '' },
  ],
}

const TABS = [
  { key: 'roles', label: 'Event Roles', icon: Wrench },
  { key: 'scouting', label: 'Scouting', icon: Target },
  { key: 'schedule', label: 'Match Schedule', icon: ClipboardList },
  { key: 'pit', label: 'Pit', icon: Tent },
]

const teamNameOf = (n) => (ALL_TEAMS.find(t => String(t.number) === String(n || '').trim()) || {}).name || ''

const uid = () => String(Date.now()) + Math.random().toString(36).slice(2)

// One person in one position. Leads pick from the roster (the same list the
// event pickers use, so no mentor, coach or the ETS account); a name saved
// before this that is not on the roster still shows, so nothing vanishes.
function Slot({ label, value, onChange, isLead, tint, options = [] }) {
  const bg = tint === 'red' ? 'bg-red-50' : tint === 'blue' ? 'bg-blue-50' : 'bg-white'
  const labelColor = tint === 'red' ? 'text-red-600' : tint === 'blue' ? 'text-blue-600' : 'text-gray-500'
  const choices = value && !options.includes(value) ? [value, ...options] : options
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${tint ? bg : ''}`}>
      <span className={`text-xs font-semibold w-14 shrink-0 ${labelColor}`}>{label}</span>
      {isLead ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 text-sm bg-transparent border-b border-gray-200 focus:border-brand-blue focus:outline-none py-0.5 text-gray-700"
        >
          <option value="">—</option>
          {choices.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <span className="flex-1 text-sm text-gray-700 truncate">{value || <span className="italic text-gray-300">—</span>}</span>
      )}
    </div>
  )
}

// onRename, when given, lets a lead change the day's name from this screen
// instead of going back to the list; the caller owns where the name lives.
// onPause, when given, puts a Pause button in the header: this day is live for
// everyone and the caller knows how to end that. Only passed to the few who may.
export default function ScoutingDaySetup({ scheduleId, dateTitle, dateSubtitle, onBack, onRename, onPause, initialTab = 'scouting' }) {
  const { username } = useUser()
  const { hasLeadTag, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const isLead = hasLeadTag
  const [data, setData] = useState(null)
  const [tab, setTab] = useState(initialTab)
  const [nameDraft, setNameDraft] = useState(null) // string while the title is being edited
  const commitName = () => {
    const next = (nameDraft || '').trim()
    if (next && next !== dateTitle) onRename?.(next)
    setNameDraft(null)
  }
  const saveTimer = useRef(null)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Fill in any missing sections so old saved rows still render
  // One job each, across the whole day: somebody on Media (or any role other
  // than Scouting) is not also a Head or a Red 2. Their scouting position is
  // cleared, not the role, because the role is the deliberate choice and the
  // position is what Randomise or an older day left behind.
  const clearConflicts = (d) => {
    const busyOutside = (role) => new Set(d.fixedRoles.filter(r => r.role !== role).flatMap(r => r.members || []))
    const busy = busyOutside(SCOUTING_ROLE)
    const busyPit = busyOutside(PIT_ROLE)
    const free = (name) => (busy.has(name) ? '' : name)
    const freePit = (name) => (busyPit.has(name) ? '' : name)
    return {
      ...d,
      standBy: free(d.standBy),
      scoutGroups: d.scoutGroups.map(g => ({
        ...g, head: free(g.head), red1: free(g.red1), red2: free(g.red2), blue1: free(g.blue1), blue2: free(g.blue2),
      })),
      pitTeams: (d.pitTeams || []).map(t => ({ ...t, who: freePit(t.who) })),
    }
  }

  const withDefaults = (loaded) => clearConflicts({
    // A role added to the default list after a day was saved is appended to
    // that day, so every day shows the same set of jobs.
    fixedRoles: (() => {
      // Roles retired from the default list leave older days too.
      const have = (loaded.fixedRoles || []).filter(r => !RETIRED_ROLES.includes(r.role))
      return [...have, ...DEFAULT_DATA.fixedRoles.filter(d => !have.some(r => r.role === d.role)).map(r => ({ ...r }))]
    })(),
    // Days saved before this started with three scouting groups. Drop the
    // second and third when nobody was ever put in them; one a lead added
    // (any other id) stays, full or not.
    scoutGroups: (loaded.scoutGroups || DEFAULT_DATA.scoutGroups.map(s => ({ ...s })))
      .filter(g => !(['s2', 's3'].includes(g.id) && !g.head && !g.red1 && !g.red2 && !g.blue1 && !g.blue2)),
    standBy: loaded.standBy ?? DEFAULT_DATA.standBy,
    matchSchedule: loaded.matchSchedule || DEFAULT_DATA.matchSchedule.map(m => ({ ...m })),
    pitTeams: loaded.pitTeams || [],
  })

  useEffect(() => {
    setData(null)
    ;(async () => {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/scouting_schedule?${SCOPE}&id=eq.${scheduleId}&select=*`, { headers: restHeaders({ 'Content-Type': 'application/json' }) })
        if (res.ok) {
          const rows = await res.json()
          const row = rows && rows.length > 0 ? rows[0] : null
          setData(withDefaults(row?.data || {}))
        } else setData(withDefaults({}))
      } catch { setData(withDefaults({})) }
    })()
  }, [supabaseUrl, supabaseKey, scheduleId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase
      .channel(`schedule-${scheduleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, onlyMyTeam((payload) => {
        if (payload.new?.id === scheduleId && payload.new?.data) setData(withDefaults(payload.new.data))
      }))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [scheduleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const autoSave = useCallback((newData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${supabaseUrl}/rest/v1/scouting_schedule`, {
          method: 'POST',
          headers: { ...restHeaders({ 'Content-Type': 'application/json' }), Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: scheduleId, data: newData, updated_by: username, updated_at: new Date().toISOString() }),
        })
      } catch (err) { console.error('Failed to save schedule:', err) }
    }, 800)
  }, [username, supabaseUrl, supabaseKey, scheduleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (updater) => setData(prev => { const next = updater(prev); autoSave(next); return next })

  // Fill the whole day at random.
  //
  // Not a toy: the rota is the longest part of setting up a competition and
  // most of it is arbitrary. Who scouts Red 1 in Group 2 does not matter, only
  // that somebody does and that nobody is in two places at once. So this deals
  // everyone out and leaves the lead to fix the handful that do matter.
  //
  // Dealt, not sampled: everybody is shuffled once and handed out in turn, so
  // nobody draws two jobs while somebody else sits out. Jobs are filled in
  // order of how much they need a person — the scouting positions first,
  // because an empty Red 2 means a match nobody watched.
  //
  // Only ever real people from the live roster, which is why it refuses rather
  // than inventing anyone when the roster has not loaded.
  const roster = useMemberNames({ forEvent: true })

  const shuffle = (list) => {
    const deck = [...list]
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
  }

  // The Scouting event role is who scouts. The positions on the Scouting tab
  // are filled from those people and nobody else, so a lead decides the pool
  // once, in Event Roles, and the tab offers only them.
  const scoutPool = (data?.fixedRoles || []).find(r => r.role === SCOUTING_ROLE)?.members || []
  const pitPool = (data?.fixedRoles || []).find(r => r.role === PIT_ROLE)?.members || []

  const shuffleEverything = () => {
    if (!roster.length) return
    // Scouting positions are dealt from the Scouting role. When nobody has been
    // put on it yet, everyone is in the pool and the people dealt a position
    // become the role, so the tab and the role still agree afterwards.
    const scouts = shuffle(scoutPool.length ? scoutPool : roster)
    const pits = shuffle(pitPool)
    const others = shuffle(roster.filter(n => !scouts.includes(n) && !pits.includes(n)))
    let at = 0
    // Round-robin: when there are fewer people than jobs, start the deck again
    // rather than leaving the rest of the day blank. Somebody doubling up is a
    // thing a lead can see and fix; an empty position is one they cannot.
    const nextScout = () => scouts[at++ % scouts.length]
    let ot = 0
    const nextOther = () => (others.length ? others : roster)[ot++ % (others.length || roster.length)]

    update(p => {
      const dealt = []
      const take = () => { const n = nextScout(); dealt.push(n); return n }
      const scoutGroups = p.scoutGroups.map(g => ({
        ...g, head: take(), red1: take(), red2: take(), blue1: take(), blue2: take(),
      }))
      const standBy = take()
      const fixedRoles = p.fixedRoles.map(r => r.role === SCOUTING_ROLE
        ? { ...r, members: scoutPool.length ? r.members : [...new Set(dealt)] }
        : r.role === PIT_ROLE ? r
        : { ...r, members: [nextOther()] })
      // Pit visits shared round the pit scouts, when there are any.
      let pt = 0
      const pitTeams = pits.length ? (p.pitTeams || []).map(t => ({ ...t, who: pits[pt++ % pits.length] })) : p.pitTeams
      return { ...p, scoutGroups, standBy, fixedRoles, pitTeams }
    })
  }
  const csv = (arr) => (arr || []).join(', ')


  if (!data) {
    return <div className="flex-1 flex items-center justify-center min-w-0"><p className="text-gray-400">Loading schedule…</p></div>
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
          <div className="flex items-center gap-2 min-w-0 text-gray-200">
            {onBack && (
              <button onClick={onBack} className="p-1.5 -ml-1 rounded-lg hover:bg-gray-800 shrink-0" title="Back to schedule">
                <ChevronLeft size={22} className="text-gray-300" />
              </button>
            )}
            <div className="min-w-0 text-gray-200">
              {nameDraft !== null ? (
                <div className="flex items-center gap-1 text-gray-200">
                  <input
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setNameDraft(null) }}
                    onBlur={commitName}
                    autoFocus
                    className="text-xl font-bold text-gray-100 min-w-0 flex-1 bg-transparent border-b-2 border-brand-blue focus:outline-none"
                  />
                  <button onMouseDown={e => e.preventDefault()} onClick={commitName} className="p-1 rounded hover:bg-gray-800" title="Save name"><Check size={16} className="text-green-600" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0 text-gray-200">
                  <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent truncate">
                    {dateTitle || 'Scouting Setup'}
                  </h1>
                  {isLead && onRename && (
                    <button onClick={() => setNameDraft(dateTitle || '')} className="p-1 rounded hover:bg-gray-800 shrink-0" title="Rename"><Pencil size={14} className="text-gray-400 hover:text-brand-blue-dark" /></button>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-300 truncate">{dateSubtitle || 'Groups, roles & scouting assignments'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-gray-200">
            {onPause && (
              <button
                onClick={onPause}
                title="Pause this Competition Day — everyone's app goes back to normal"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors"
              >
                <Pause size={15} /> Pause
              </button>
            )}
            {isLead && tab === 'scouting' && (
              <button
                onClick={shuffleEverything}
                disabled={!roster.length}
                title={roster.length
                  ? 'Deal everyone out at random — scouting positions, stand-by and event roles'
                  : 'Waiting for the roster'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-gold hover:bg-brand-gold-dark text-gray-100 transition-colors disabled:bg-gray-800 disabled:text-gray-400"
              >
                <Shuffle size={15} /> Randomise
              </button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="px-4 pb-2 ml-14 flex gap-1.5 overflow-x-auto text-gray-200">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${active ? 'bg-gradient-to-r from-brand-blue to-brand-yellow text-white shadow-sm' : 'bg-gray-800 text-gray-300 hover:bg-gray-200'}`}>
                <Icon size={14} /> {t.label}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* ---- EVENT ROLES TAB ---- */}
          {tab === 'roles' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.fixedRoles.map((role, i) => (
                <div key={role.role} className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">{role.role}</h4>
                  {isLead ? (
                    <MemberPicker
                      forEvent
                      value={role.members}
                      // One job each: somebody already on another role is not offered here.
                      exclude={data.fixedRoles.filter((_, k) => k !== i).flatMap(r => r.members || [])}
                      onChange={members => update(p => { const r = [...p.fixedRoles]; r[i] = { ...r[i], members }; return clearConflicts({ ...p, fixedRoles: r }) })}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {role.members.length ? role.members.map(m => <span key={m} className="text-xs px-2 py-0.5 bg-brand-yellow/20 text-gray-600 rounded-full">{m}</span>) : <span className="text-xs italic text-gray-300">Not assigned</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ---- SCOUTING TAB ---- */}
          {tab === 'scouting' && (
            <>
              {isLead && !scoutPool.length && (
                <p className="text-xs text-gray-400">
                  Positions here are picked from the people on the <button onClick={() => setTab('roles')} className="font-semibold text-brand-blue-dark hover:underline">Scouting role</button> in Event Roles. Nobody is on it yet, so put your scouts there first, or press Randomise to deal everyone out.
                </p>
              )}
              {/* Stand By */}
              <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-2">
                <Star size={15} className="text-brand-silver-dark shrink-0" />
                <span className="text-xs font-semibold text-gray-500 shrink-0">Stand By</span>
                {isLead ? (
                  <select value={data.standBy || ''} onChange={e => update(p => ({ ...p, standBy: e.target.value }))} className="flex-1 min-w-0 text-sm bg-transparent border-b border-gray-200 focus:border-brand-blue focus:outline-none py-0.5 text-gray-700">
                    <option value="">—</option>
                    {(data.standBy && !scoutPool.includes(data.standBy) ? [data.standBy, ...scoutPool] : scoutPool).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <span className="text-sm font-medium text-gray-700">{data.standBy || <span className="italic text-gray-300">—</span>}</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.scoutGroups.map((g, i) => (
                  <div key={g.id} className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100">
                    {isLead ? (
                      <div className="flex items-center gap-1 mb-2">
                        <input value={g.name} onChange={e => update(p => { const s = [...p.scoutGroups]; s[i] = { ...s[i], name: e.target.value }; return { ...p, scoutGroups: s } })} className="flex-1 min-w-0 text-sm font-bold text-gray-700 border-b border-gray-200 focus:border-brand-blue focus:outline-none py-0.5" />
                        {data.scoutGroups.length > 1 && (
                          <button onClick={() => update(p => ({ ...p, scoutGroups: p.scoutGroups.filter(x => x.id !== g.id) }))} title="Remove this group" className="p-1 rounded hover:bg-red-50 shrink-0"><Trash2 size={14} className="text-gray-300 hover:text-red-400" /></button>
                        )}
                      </div>
                    ) : (
                      <h4 className="text-sm font-bold text-gray-700 mb-2">{g.name}</h4>
                    )}
                    <div className="space-y-1">
                      <Slot options={scoutPool} label="Head" value={g.head} isLead={isLead} onChange={v => update(p => { const s = [...p.scoutGroups]; s[i] = { ...s[i], head: v }; return { ...p, scoutGroups: s } })} />
                      <Slot options={scoutPool} label="Red 1" tint="red" value={g.red1} isLead={isLead} onChange={v => update(p => { const s = [...p.scoutGroups]; s[i] = { ...s[i], red1: v }; return { ...p, scoutGroups: s } })} />
                      <Slot options={scoutPool} label="Red 2" tint="red" value={g.red2} isLead={isLead} onChange={v => update(p => { const s = [...p.scoutGroups]; s[i] = { ...s[i], red2: v }; return { ...p, scoutGroups: s } })} />
                      <Slot options={scoutPool} label="Blue 1" tint="blue" value={g.blue1} isLead={isLead} onChange={v => update(p => { const s = [...p.scoutGroups]; s[i] = { ...s[i], blue1: v }; return { ...p, scoutGroups: s } })} />
                      <Slot options={scoutPool} label="Blue 2" tint="blue" value={g.blue2} isLead={isLead} onChange={v => update(p => { const s = [...p.scoutGroups]; s[i] = { ...s[i], blue2: v }; return { ...p, scoutGroups: s } })} />
                    </div>
                  </div>
                ))}
              </div>
              {isLead && (
                <button onClick={() => update(p => ({ ...p, scoutGroups: [...p.scoutGroups, { id: uid(), name: `Group ${p.scoutGroups.length + 1}`, head: '', red1: '', red2: '', blue1: '', blue2: '' }] }))} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-yellow hover:bg-brand-yellow-dark text-gray-700"><Plus size={14} /> Add Group</button>
              )}
            </>
          )}

          {/* ---- MATCH SCHEDULE TAB ---- */}
          {tab === 'schedule' && (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Who plays in each match. A team number fills in its name from the
                team list; anything not on the list still saves, it just shows as
                a number. This is what lets a scout's screen say which team they
                are watching rather than only which match.
              </p>
              <div className="space-y-2">
                {data.matchSchedule.map((row, i) => {
                  const set = (key, value) => update(p => {
                    const m = [...p.matchSchedule]; m[i] = { ...m[i], [key]: value }
                    return { ...p, matchSchedule: m }
                  })
                  const nameOf = (n) => (ALL_TEAMS.find(t => String(t.number) === String(n).trim()) || {}).name || ''
                  const cell = (key, label) => (
                    <div key={key} className="min-w-0">
                      <label className="block text-[10px] uppercase tracking-wide text-gray-400">{label}</label>
                      <input
                        value={row[key] || ''}
                        onChange={e => set(key, e.target.value)}
                        disabled={!isLead}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-full text-sm border-b border-gray-200 focus:border-brand-blue focus:outline-none disabled:bg-transparent"
                      />
                      <span className="block text-[10px] text-gray-400 truncate">{nameOf(row[key])}</span>
                    </div>
                  )
                  return (
                    <div key={row.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-400">Match</span>
                        <input
                          value={row.match || ''}
                          onChange={e => set('match', e.target.value)}
                          disabled={!isLead}
                          inputMode="numeric"
                          className="w-14 text-sm font-semibold border-b border-gray-200 focus:border-brand-blue focus:outline-none disabled:bg-transparent"
                        />
                        {isLead && (
                          <button
                            onClick={() => update(p => ({ ...p, matchSchedule: p.matchSchedule.filter(x => x.id !== row.id) }))}
                            className="ml-auto p-1 rounded hover:bg-red-50"
                          >
                            <Trash2 size={14} className="text-gray-300 hover:text-red-400" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {cell('red1', 'Red 1')}
                        {cell('red2', 'Red 2')}
                        {cell('blue1', 'Blue 1')}
                        {cell('blue2', 'Blue 2')}
                      </div>
                    </div>
                  )
                })}
              </div>
              {isLead && (
                <button
                  onClick={() => update(p => {
                    const last = p.matchSchedule[p.matchSchedule.length - 1]
                    const next = last && /^\d+$/.test(String(last.match)) ? String(Number(last.match) + 1) : ''
                    return { ...p, matchSchedule: [...p.matchSchedule, { id: uid(), match: next, red1: '', red2: '', blue1: '', blue2: '' }] }
                  })}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-yellow hover:bg-brand-yellow-dark text-gray-700"
                >
                  <Plus size={14} /> Add Match
                </button>
              )}
            </>
          )}

          {/* ---- PIT TAB ---- */}
          {tab === 'pit' && (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Which teams get a pit visit and who makes it. People are picked
                from the Pit Scouting role in Event Roles. A pit is visited
                once, so there is no match number.
              </p>
              {isLead && !pitPool.length && (
                <p className="text-xs text-gray-400 mb-3">
                  Nobody is on the <button onClick={() => setTab('roles')} className="font-semibold text-brand-blue-dark hover:underline">Pit Scouting role</button> yet, so there is nobody to give a visit to.
                </p>
              )}
              <div className="space-y-2">
                {(data.pitTeams || []).map((row, i) => (
                  <div key={row.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className="w-28 shrink-0 min-w-0">
                      <label className="block text-[10px] uppercase tracking-wide text-gray-400">Team</label>
                      <input
                        value={row.team || ''}
                        onChange={e => update(p => { const t = [...p.pitTeams]; t[i] = { ...t[i], team: e.target.value }; return { ...p, pitTeams: t } })}
                        disabled={!isLead}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-full text-sm font-semibold border-b border-gray-200 focus:border-brand-blue focus:outline-none disabled:bg-transparent"
                      />
                      <span className="block text-[10px] text-gray-400 truncate">{teamNameOf(row.team)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Slot label="Who" value={row.who} isLead={isLead} options={pitPool} onChange={v => update(p => { const t = [...p.pitTeams]; t[i] = { ...t[i], who: v }; return { ...p, pitTeams: t } })} />
                    </div>
                    {isLead && (
                      <button onClick={() => update(p => ({ ...p, pitTeams: p.pitTeams.filter(x => x.id !== row.id) }))} className="p-1 rounded hover:bg-red-50 shrink-0" title="Remove">
                        <Trash2 size={14} className="text-gray-300 hover:text-red-400" />
                      </button>
                    )}
                  </div>
                ))}
                {!(data.pitTeams || []).length && <p className="text-sm text-gray-400 italic">No pit visits yet.</p>}
              </div>
              {isLead && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => update(p => ({ ...p, pitTeams: [...(p.pitTeams || []), { id: uid(), team: '', who: '' }] }))} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-yellow hover:bg-brand-yellow-dark text-gray-700"><Plus size={14} /> Add Team</button>
                  <button
                    onClick={() => update(p => {
                      const have = new Set((p.pitTeams || []).map(t => String(t.team || '').trim()))
                      const fresh = []
                      ;(p.matchSchedule || []).forEach(m => ['red1', 'red2', 'blue1', 'blue2'].forEach(k => {
                        const t = String(m[k] || '').trim()
                        if (t && !have.has(t)) { have.add(t); fresh.push({ id: uid(), team: t, who: '' }) }
                      }))
                      return { ...p, pitTeams: [...(p.pitTeams || []), ...fresh] }
                    })}
                    title="Every team on the match schedule that is not listed here yet"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    <ClipboardList size={14} /> Add teams from the match schedule
                  </button>
                  <button
                    onClick={() => update(p => { let k = 0; return { ...p, pitTeams: (p.pitTeams || []).map(t => ({ ...t, who: pitPool[k++ % pitPool.length] })) } })}
                    disabled={!pitPool.length || !(data.pitTeams || []).length}
                    title={pitPool.length ? 'Deal the visits out evenly, in turn, to the pit scouts' : 'Put people on the Pit Scouting role first'}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-gold hover:bg-brand-gold-dark text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <Shuffle size={14} /> Share out
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  )
}
