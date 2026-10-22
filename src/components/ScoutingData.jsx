import { useState, useEffect, useMemo } from 'react'
import { startLabel } from '../data/fieldMap'
import { restHeaders, ensureUserToken } from '../lib/restHeaders'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Trash2, Plus, X, Calendar, Download } from 'lucide-react'
import { SCOUTING_FIELDS, yesNo, displayValue, rpOf } from '../data/scoutingFields'
import { ALL_TEAMS as TEAM_LIST } from '../data/teams'
import { PIT_FIELDS } from '../data/pitFields'
import { SCOUT_SAVED, announceScoutSaved } from '../lib/scoutHandoff'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { onlyMyTeam, scopeQuery, stampTeam, teamScope } from '../lib/teamScope'
import NotificationBell from './NotificationBell'
import ScoutingAccountability from './ScoutingAccountability'

// Default considered teams (used as fallback before Supabase loads)
const DEFAULT_CONSIDERED = []

// Per-team scouting stats, populated live from match_scouting.
const SCOUT_STATS = {}

// Machu Picchu League (Iowa) — loaded with blank data for the new season.
const BLANK = { rank: null, rp: 0, tbp: 0, autoAvg: 0, teleopAvg: 0, highScore: 0, record: '--', played: 0 }
// The team list lives in data/teams.js, shared with the scouting form so the
// dropdown and this table are always the same set. BLANK fills in the stats
// a team has before anyone has scouted it.
const ALL_TEAMS = TEAM_LIST.map(t => ({ ...t, ...BLANK }))

// Delete permission now handled by usePermissions hook (canDeleteScouting)

function pctBar(value) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full bg-gray-200">
        <div
          className="h-2.5 rounded-full bg-brand-yellow transition-all"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{value}%</span>
    </div>
  )
}

// What RadRank shows per team, computed from match_scouting — the same fields
// the scouting form records. It used to read a previous season's game
// (artifacts, motif order, parking), none of which anybody scouts any more, so
// every number here was always going to be zero.
//
// A blank is skipped rather than counted as zero: a scout who did not see
// something must not drag a team's average down.
function computeScoutingStats(matches) {
  const n = matches.length
  const nums = (key) => matches.map(m => m[key]).filter(v => v != null && v !== '').map(Number)
  const avg = (key) => {
    const v = nums(key)
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : 0
  }
  const sum = (key) => nums(key).reduce((a, b) => a + b, 0)
  const pct = (num, den) => den === 0 ? 0 : Math.round((num / den) * 100)
  // `as` groups answers before counting them. A starting position is now an
  // exact point, so counting the raw values would give every team a handful
  // of dots each seen once; it is counted by the side of the field instead.
  const tally = (key, as) => {
    const out = {}
    matches.forEach(m => {
      const v = as ? as(m[key]) : m[key]
      if (v) out[v] = (out[v] || 0) + 1
    })
    return out
  }

  // Share of the matches answered where they did it. A blank is skipped, the
  // same as for averages.
  const yesPct = (key) => {
    const v = matches.map(m => yesNo(m[key])).filter(x => x != null)
    return pct(v.filter(Boolean).length, v.length)
  }

  // Made out of shot. Guarded, because a team nobody saw shoot is 0/0 and
  // dividing there would read as 0% accuracy rather than "we do not know".
  const madeRate = (made, shot) => (shot ? Math.round((made / shot) * 100) : null)

  return {
    scoutCount: n,
    startingPositions: tally('start_position', startLabel),

    // Shot and made, and the accuracy between them. "Did they score" could not
    // tell ten-for-two apart from two-for-two, which is the whole question
    // when you are choosing who to pick.
    autoAvgShot: avg('auto_shot'),
    autoAvgMade: avg('auto_made'),
    autoAccuracy: madeRate(avg('auto_made'), avg('auto_shot')),
    teleAvgShot: avg('teleop_shot'),
    teleAvgMade: avg('teleop_made'),
    teleAccuracy: madeRate(avg('teleop_made'), avg('teleop_shot')),
    endAvgShot: avg('endgame_shot'),
    endAvgMade: avg('endgame_made'),
    endAccuracy: madeRate(avg('endgame_made'), avg('endgame_shot')),
    autoLeavePct: yesPct('auto_leave'),
    autoParkPct: yesPct('auto_park'),
    avgTips: avg('teleop_tips'),
    avgAutoTips: avg('auto_tips'),

    avgCycles: avg('cycle_count'),
    avgCycleSec: avg('avg_cycle_sec'),

    autoReliability: avg('auto_reliability'),   // a percentage now
    robotSpeed: avg('robot_speed'),             // the rest out of 5
    driverSkill: avg('driver_skill'),
    consistency: avg('consistency'),
    defenseResistance: avg('defense_resistance'),

    defense: tally('defense'),
    endgame: tally('endgame'),
    breakdowns: tally('breakdowns'),
    avgMinors: avg('minors'),
    avgMajors: avg('majors'),

    // Shares of matches, which a pick list cares about more than any average.
    // Endgame is tick-all now, so "Successful" is no longer a value. Doing
    // anything at all is the thing worth counting; "Nothing" is the only
    // answer that is not something.
    endgameSuccessPct: pct(matches.filter(m => {
      const e = String(m.endgame || '')
      return e && e !== 'Nothing'
    }).length, n),
    cleanMatchPct: pct(matches.filter(m => !m.breakdowns || m.breakdowns === 'None').length, n),

    // Ranking points, as the scout ticked them: Win, Auto, Endgame, Tie, each
    // one point, "None" nothing. Averaged over the matches that answered.
    rpPerMatch: (() => {
      const v = matches.map(m => m.rp_points).filter(x => x != null && x !== '')
      if (!v.length) return 0
      const total = v.reduce((acc, x) => acc + rpOf(x), 0)
      return +(total / v.length).toFixed(1)
    })(),
    // The most they made in a single match, auto and teleop together.
    bestMade: matches.reduce((best, m) => Math.max(best, Number(m.auto_made || 0) + Number(m.teleop_made || 0) + Number(m.endgame_made || 0)), 0),
    gardenAvg: avg('garden_score'),
    parking: tally('parking'),
  }
}

// What we know about a team, in the order a pick list asks: can they score,
// can they cycle, how do they handle pressure, and do they break.
//
// Every figure here comes from the scouting form's own fields. The two panels
// this replaces each rendered a previous season's game from their own copy of
// the markup, which is how they came to disagree with the form in the first
// place — one component now, so there is nowhere for them to drift apart.
function ScoutPanel({ t }) {
  const rate = (v, outOf) => v ? `${v}/${outOf}` : '—'
  const most = (tally) => {
    const e = Object.entries(tally || {})
    if (!e.length) return '—'
    return e.sort((a, b) => b[1] - a[1])[0][0]
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-100 pb-1">
        Our Scouting Data{' '}
        <span className="font-normal text-gray-400">
          ({t.scoutCount} match{t.scoutCount !== 1 ? 'es' : ''})
        </span>
      </h3>

      {t.scoutCount === 0 ? (
        <p className="text-xs text-gray-400 py-2">Nobody has scouted this team yet.</p>
      ) : (
        <>
          {/* Scoring — the first question anyone asks. */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat value={t.teleAccuracy == null ? '—' : `${t.teleAccuracy}%`} label="Teleop accuracy" />
            <Stat value={t.teleAvgMade || '—'} label="Made / match" />
            <Stat value={t.avgCycles} label="Cycles / match" />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
            <Line label="Teleop shot / match" value={t.teleAvgShot || '—'} />
            <Line label="Auto shot / match" value={t.autoAvgShot || '—'} />
            <Line label="Auto made / match" value={t.autoAvgMade || '—'} />
            <Line label="Auto accuracy" value={t.autoAccuracy == null ? '—' : `${t.autoAccuracy}%`} />
            <Line label="Endgame made / match" value={t.endAvgMade || '—'} />
            <Line label="Endgame accuracy" value={t.endAccuracy == null ? '—' : `${t.endAccuracy}%`} />
            <Line label="Leaves in auto" value={`${t.autoLeavePct}%`} />
            <Line label="Parks in auto" value={`${t.autoParkPct}%`} />
            <Line label="Seconds / cycle" value={t.avgCycleSec || '—'} />
            <Line label="Hive tips / match (teleop)" value={t.avgTips || '—'} />
            <Line label="Hive tips / match (auto)" value={t.avgAutoTips || '—'} />
          </div>

          {/* The ratings, as bars — out of 5, except the two the form now asks
              as a percentage. */}
          <div className="space-y-1 mb-3">
            <Rated label="Driver skill" value={t.driverSkill} outOf={5} />
            <Rated label="Consistency" value={t.consistency} outOf={5} />
            <Rated label="Robot speed" value={t.robotSpeed} outOf={5} />
            <Rated label="Auto reliability" value={t.autoReliability} outOf={100} />
            <Rated label="Holds up to defense" value={t.defenseResistance} outOf={100} />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Line label="Does an endgame" value={`${t.endgameSuccessPct}%`} />
            <Line label="Matches without breakdown" value={`${t.cleanMatchPct}%`} />
            <Line label="Plays defense" value={most(t.defense)} />
            <Line label="Minors / match" value={t.avgMinors || '—'} />
            <Line label="Majors / match" value={t.avgMajors || '—'} />
            <Line label="Usual start" value={most(t.startingPositions)} />
            <Line label="Usual endgame" value={most(t.endgame)} />
            <Line label="Worst breakdown" value={
              t.breakdowns?.Major ? `Major ×${t.breakdowns.Major}`
              : t.breakdowns?.Minor ? `Minor ×${t.breakdowns.Minor}`
              : t.scoutCount ? 'None' : '—'} />
          </div>
        </>
      )}
    </div>
  )
}

const Stat = ({ value, label }) => (
  <div className="bg-gray-50 rounded-lg p-2 text-center">
    <p className="text-base font-bold text-gray-800">{value}</p>
    <p className="text-[10px] text-gray-500 uppercase">{label}</p>
  </div>
)

const Line = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-xs font-semibold text-gray-700">{value}</span>
  </div>
)

// A rating means nothing without its scale, so the bar carries it: 4 out of 5
// and 4 out of 3 are not the same claim.
const Rated = ({ label, value, outOf }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full rounded-full bg-brand-gold-dark"
           style={{ width: `${Math.min(100, (value / outOf) * 100)}%` }} />
    </div>
    <span className="text-xs font-semibold text-gray-700 w-9 text-right">
      {value ? `${value}/${outOf}` : '—'}
    </span>
  </div>
)

// What the pit visit said about a team: the latest visit's answers, in the
// form's own groups and words, with older visits a tap away. Shown beside the
// match numbers because a pick list needs both — what they can do, and what
// they actually did.
const PIT_SKIP = new Set(['team_number', 'team_name', 'scout_name', 'visited_at'])
function PitPanel({ visits }) {
  const [which, setWhich] = useState(0)
  const n = visits.length
  const v = visits[Math.min(which, Math.max(0, n - 1))]
  const when = (row) => {
    const t = row.visited_at || row.created_at || ''
    const d = new Date(t)
    return isNaN(d) ? String(t) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  const groups = []
  PIT_FIELDS.forEach(f => {
    if (PIT_SKIP.has(f.key)) return
    let g = groups.find(x => x.name === f.group)
    if (!g) { g = { name: f.group, fields: [] }; groups.push(g) }
    g.fields.push(f)
  })
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-100 pb-1">
        Pit Scouting{' '}
        <span className="font-normal text-gray-400">({n} visit{n !== 1 ? 's' : ''})</span>
      </h3>
      {n === 0 ? (
        <p className="text-xs text-gray-400 py-2">Nobody has visited this team's pit yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-gray-500">
            <span>By <span className="font-semibold text-gray-700">{v.scout_name || v.scout || '—'}</span> · {when(v)}</span>
            {n > 1 && (
              <select value={which} onChange={e => setWhich(Number(e.target.value))} className="ml-auto text-xs border rounded-lg px-2 py-1 bg-white text-gray-600">
                {visits.map((row, i) => <option key={row.id || i} value={i}>{i === 0 ? 'Latest' : `Visit ${n - i}`} · {when(row)}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-2">
            {groups.map(g => {
              const answered = g.fields.filter(f => v[f.key] != null && String(v[f.key]).trim() !== '')
              if (!answered.length) return null
              return (
                <div key={g.name}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{g.name}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {answered.map(f => f.type === 'photo' ? (
                      <div key={f.key} className="sm:col-span-2">
                        <a href={v[f.key]} target="_blank" rel="noreferrer" className="inline-block">
                          <img src={v[f.key]} alt={`Team ${v.team_number} robot`} className="max-h-40 rounded-lg border border-gray-100" />
                        </a>
                      </div>
                    ) : f.type === 'text' && String(v[f.key]).length > 40 ? (
                      <div key={f.key} className="sm:col-span-2">
                        <span className="text-xs text-gray-500">{f.label}</span>
                        <p className="text-xs text-gray-700">{v[f.key]}</p>
                      </div>
                    ) : (
                      <Line key={f.key} label={f.label} value={String(v[f.key])} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ScoutingData() {
  const { username } = useUser()
  const { canDeleteScouting: canDelete, canViewScoutingData, isGuest, hasLeadTag, isCofounder, myTeamNumber } = usePermissions()
  // One rule for whose rows these are — see lib/teamScope.js.
  const SCOPE = teamScope(myTeamNumber)
  const [records, setRecords] = useState([])
  const [expandedTeams, setExpandedTeams] = useState({})
  const [consideredList, setConsideredList] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', number: '', rank: '' })
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedDate, setSelectedDate] = useState('') // '' = all dates

  // Teams on any Competition Day's match schedule or pit list. A team we are
  // going to scout belongs on this page before the first row comes in, and
  // the team list in data/teams.js is a shortlist, not the whole field. Named
  // from the list when it knows them, "Team N" otherwise.
  const [dayTeams, setDayTeams] = useState([])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/scouting_schedule?${SCOPE}&id=like.day-*&select=id,data`,
          { headers: restHeaders() }
        )
        if (!res.ok) return
        const rows = await res.json()
        const seen = new Map()
        ;(Array.isArray(rows) ? rows : []).forEach(({ data }) => {
          ;(data?.matchSchedule || []).forEach(m => ['red1', 'red2', 'blue1', 'blue2'].forEach(k => {
            const t = String(m[k] || '').trim(); if (t) seen.set(t, true)
          }))
          ;(data?.pitTeams || []).forEach(p => { const t = String(p.team || '').trim(); if (t) seen.set(t, true) })
        })
        if (active) setDayTeams([...seen.keys()])
      } catch { /* the page still works from the team list alone */ }
    }
    load()
    const channel = supabase
      .channel('scouting-data-day-teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule' }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [SCOPE])

  // Get unique submission dates from records
  const availableDates = useMemo(() => {
    const dateSet = new Set()
    records.forEach(r => {
      if (r.created_at) {
        const date = r.created_at.split('T')[0] // YYYY-MM-DD
        dateSet.add(date)
      }
    })
    return [...dateSet].sort((a, b) => b.localeCompare(a)) // newest first
  }, [records])

  // Filter records by selected date
  const filteredRecords = useMemo(() => {
    if (!selectedDate) return records
    return records.filter(r => r.created_at && r.created_at.startsWith(selectedDate))
  }, [records, selectedDate])

  // Pit visits, newest first, grouped by the team visited.
  const [pitRows, setPitRows] = useState([])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/pit_scouting?select=*&order=created_at.desc`,
          { headers: restHeaders() }
        )
        if (!res.ok) return
        const rows = await res.json()
        if (active) setPitRows(Array.isArray(rows) ? rows : [])
      } catch { /* the page still works without pit data */ }
    }
    load()
    const channel = supabase
      .channel('scouting-data-pit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pit_scouting' }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [])
  const pitByTeam = useMemo(() => {
    const out = {}
    pitRows.forEach(r => {
      const num = String(r.team_number || '').trim()
      if (!num) return
      ;(out[num] = out[num] || []).push(r)
    })
    return out
  }, [pitRows])

  // Load from Supabase
  useEffect(() => {
    // This team's scouting. owner_team, not team_number: team_number here is
    // the robot that was scouted.
    //
    // Plain fetch with the user's token, the same way the form saves and
    // reads, not the supabase-js client: the client can sit on a stuck token
    // refresh after a reload and return nothing, silently, which showed here
    // as "0 scouting responses" while the rows were there all along. See
    // supabase-hard-refresh-bug.txt. An empty answer is asked again, since an
    // empty table is almost always a token that was not ready yet.
    let cancelled = false
    const load = async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, 800))
        try {
          await ensureUserToken()
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/match_scouting?${teamScope(myTeamNumber, 'owner_team')}&select=*&order=created_at.asc`,
            { headers: restHeaders() }
          )
          if (!res.ok) { console.error('Failed to load scouting records:', res.status, await res.text()); continue }
          const data = await res.json()
          if (cancelled) return
          if (Array.isArray(data)) { setRecords(data); if (data.length) return }
        } catch (err) { console.error('Exception loading scouting records:', err) }
      }
    }
    load()
    // Realtime below is the fast path. This is the safety net: a form on this
    // device just saved, or the page came back to the front, so ask again.
    // A row must never be missing here because one message went astray.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener(SCOUT_SAVED, load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener(SCOUT_SAVED, load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [myTeamNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('scouting-data-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_scouting' }, onlyMyTeam((payload) => {
        setRecords(prev => {
          if (prev.some(r => r.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      }, 'owner_team'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'match_scouting' }, onlyMyTeam((payload) => {
        setRecords(prev => prev.filter(r => r.id !== payload.old.id))
      }, 'owner_team'))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // Considered teams, read the same way for the same reason.
  const loadConsidered = async () => {
    try {
      await ensureUserToken()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/considered_teams?${teamScope(myTeamNumber, 'owner_team')}&select=*`,
        { headers: restHeaders() }
      )
      if (!res.ok) { console.error('Failed to load considered teams:', res.status); return }
      const data = await res.json()
      if (Array.isArray(data)) setConsideredList(data)
    } catch (err) { console.error('Exception loading considered teams:', err) }
  }
  useEffect(() => { loadConsidered() }, [myTeamNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime for considered teams
  useEffect(() => {
    const channel = supabase
      .channel('considered-teams-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'considered_teams' }, loadConsidered)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const handleAddConsidered = async () => {
    try {
      const number = addForm.number.trim()
      const name = addForm.name.trim()
      const rank = addForm.rank ? parseInt(addForm.rank) : null
      if (!number || !name) return

      // If a rank is specified, shift existing teams at that rank and below
      if (rank) {
        const toShift = consideredList.filter(c => c.rank && c.rank >= rank)
        for (const c of toShift) {
          await scopeQuery(supabase.from('considered_teams').update({ rank: c.rank + 1 }).eq('team_number', c.team_number), 'owner_team')
        }
      }

      const { data: insertData, error } = await supabase.from('considered_teams').insert(stampTeam({
        team_number: number,
        team_name: name,
        rank: rank,
        added_by: username
      }, myTeamNumber, 'owner_team')).select()
      if (error) {
        alert('Failed to add team: ' + error.message)
        return
      }
      // Refetch to get updated ranks
      await loadConsidered()
      setAddForm({ name: '', number: '', rank: '' })
      setShowAddModal(false)
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleRemoveConsidered = async (teamNumber) => {
    const { error } = await scopeQuery(supabase.from('considered_teams').delete().eq('team_number', teamNumber), 'owner_team')
    if (error) console.error('Failed to remove considered team:', error.message)
    else setConsideredList(prev => prev.filter(c => c.team_number !== teamNumber))
  }

  const handleDelete = async (id) => {
    try {
      await ensureUserToken()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/match_scouting?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: restHeaders() }
      )
      if (!res.ok) { console.error('Failed to delete:', res.status, await res.text()); return }
      setRecords(prev => prev.filter(r => r.id !== id))
      announceScoutSaved()   // the board puts "Scout it" back on that job
    } catch (err) { console.error('Failed to delete:', err) }
  }

  const consideredNumbers = consideredList.map(c => c.team_number)

  // Merge competition data with scouting submissions, split into considered vs rest
  const { consideredTeams, otherTeams } = useMemo(() => {
    // Group scouting records by team number (using filtered records)
    const byNumber = {}
    filteredRecords.forEach(r => {
      // match_scouting keeps one flat row per team per match. The old table
      // nested everything in a `data` blob, which is why this used to reach
      // through r.data.
      const num = String(r.team_number || '').trim()
      if (!num) return
      if (!byNumber[num]) byNumber[num] = []
      byNumber[num].push({ ...r, _id: r.id, _by: r.scout, _at: r.created_at })
    })

    // Build team list from ALL_TEAMS, attach scouting data
    // Use hardcoded SCOUT_STATS as base, override with dynamic data if available
    const knownNumbers = new Set(ALL_TEAMS.map(t => t.number))
    const all = ALL_TEAMS.map(t => {
      const matches = byNumber[t.number] || []
      delete byNumber[t.number]
      const dynamicStats = computeScoutingStats(matches)
      const hardcodedStats = SCOUT_STATS[t.number]
      // When filtering by date, only use dynamic stats (hardcoded stats are all-time and can't be date-filtered)
      const stats = dynamicStats.scoutCount > 0 ? dynamicStats : (!selectedDate && hardcodedStats ? { ...hardcodedStats, scoutCount: hardcodedStats.scouted, startingPositions: {} } : dynamicStats)
      return { ...t, matches, ...stats }
    })

    // Teams from the Competition Day schedules, or with a pit visit, that the
    // team list does not know.
    ;[...dayTeams, ...Object.keys(pitByTeam)].forEach(num => {
      if (knownNumbers.has(num)) return
      knownNumbers.add(num)
      const matches = byNumber[num] || []
      delete byNumber[num]
      all.push({
        number: num, name: `Team ${num}`, rank: null, record: '-', played: 0,
        rp: '-', tbp: '-', autoAvg: '-', teleopAvg: '-', highScore: '-',
        matches, ...computeScoutingStats(matches),
      })
    })

    // Add custom teams (not in ALL_TEAMS) from considered list
    consideredList.forEach(c => {
      if (!knownNumbers.has(c.team_number)) {
        const matches = byNumber[c.team_number] || []
        delete byNumber[c.team_number]
        const stats = computeScoutingStats(matches)
        all.push({
          number: c.team_number,
          name: c.team_name || `Team ${c.team_number}`,
          rank: c.rank || null,
          record: '-',
          played: 0,
          rp: '-',
          tbp: '-',
          autoAvg: '-',
          teleopAvg: '-',
          highScore: '-',
          matches,
          ...stats,
        })
      }
    })

    // Apply rank overrides from considered_teams
    const rankOverrides = {}
    consideredList.forEach(c => { if (c.rank) rankOverrides[c.team_number] = c.rank })

    const considered = all
      .filter(t => consideredNumbers.includes(t.number))
      .map(t => rankOverrides[t.number] ? { ...t, rank: rankOverrides[t.number] } : t)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999))
    // A rank somebody typed in comes first; after that, the teams we have
    // scouted, best teleop scorers first, so the list means something before
    // anyone has entered a ranking.
    const byScouting = (a, b) => (b.teleAvgMade || 0) - (a.teleAvgMade || 0)
      || (b.autoAvgMade || 0) - (a.autoAvgMade || 0)
      || (b.scoutCount || 0) - (a.scoutCount || 0)
    const others = all.filter(t => !consideredNumbers.includes(t.number))
      .sort((a, b) => ((a.rank || 999) - (b.rank || 999)) || byScouting(a, b))

    return { consideredTeams: considered, otherTeams: others }
  }, [filteredRecords, consideredList, consideredNumbers, selectedDate, dayTeams, pitByTeam])

  const toggleExpand = (key) => {
    setExpandedTeams(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const [exportReady, setExportReady] = useState(false)
  const [exportRecordsCache, setExportRecordsCache] = useState([])

  // Pre-fetch scouting records using anon key directly (bypasses auth RLS)
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${supabaseUrl}/rest/v1/match_scouting?${teamScope(myTeamNumber, 'owner_team')}&select=*&order=created_at.asc`, {
      headers: restHeaders(),
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setExportRecordsCache(data)
          setExportReady(true)
        }
      })
      .catch(() => {})
  }, [])

  const exportToSheets = () => {
    const exportRecords = selectedDate
      ? exportRecordsCache.filter(r => r.created_at && r.created_at.startsWith(selectedDate))
      : exportRecordsCache
    if (exportRecords.length === 0) {
      alert('No scouting records found. Try refreshing the page.')
      return
    }
    // Built from the field definitions, so the export can never drift from
    // what the form records — which is exactly what had happened: this still
    // exported a previous season's columns.
    const headers = ['Team Number', ...SCOUTING_FIELDS.filter(f => f.key !== 'team_number').map(f => f.label), 'Scout', 'Recorded At']
    const escape = (v) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = exportRecords.map(r => [
      r.team_number,
      ...SCOUTING_FIELDS.filter(f => f.key !== 'team_number').map(f => displayValue(f, r[f.key])),
      r.scout || '', r.created_at || '',
    ])
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scouting-forms${selectedDate ? `-${selectedDate}` : ''}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const addTeamModal = showAddModal ? createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { setShowAddModal(false); setAddForm({ name: '', number: '', rank: '' }) }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: '384px', margin: '0 16px', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Add Team to Considered</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Team Name</label>
            <input
              type="text"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              placeholder="e.g. Pioneer Robotics"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Team Number</label>
            <input
              type="text"
              value={addForm.number}
              onChange={e => setAddForm(f => ({ ...f, number: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              placeholder="e.g. 25656"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Rank <span className="text-gray-400">(optional)</span></label>
            <input
              type="number"
              min="1"
              value={addForm.rank}
              onChange={e => setAddForm(f => ({ ...f, rank: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              placeholder="e.g. 5"
            />
            <p className="text-[10px] text-gray-400 mt-1">If this rank is taken, existing teams will shift down</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => { setShowAddModal(false); setAddForm({ name: '', number: '', rank: '' }) }}
            className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddConsidered}
            disabled={!addForm.name.trim() || !addForm.number.trim()}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-brand-yellow-dark hover:bg-brand-yellow rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Team
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
    {addTeamModal}
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-4 ml-14 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              Scouting Data
            </h1>
            <p className="text-sm text-gray-300">
              {consideredTeams.length + otherTeams.length} teams &middot; {filteredRecords.length} scouting response{filteredRecords.length !== 1 ? 's' : ''}
              {selectedDate && ` on ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-gray-200">
            <div className="relative text-gray-200">
              <div className="flex items-center gap-1.5 text-gray-200">
                <Calendar size={14} className="text-gray-400" />
                <select
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 pr-6 text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow appearance-none cursor-pointer"
                >
                  <option value="">All Dates</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>
                      {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-brand-yellow text-white text-[10px]"
                  title="Clear date filter"
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <button
              onClick={exportToSheets}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-yellow-dark hover:bg-brand-yellow rounded-lg transition-colors shadow-sm"
              title="Download scouting form data as CSV"
            >
              <Download size={14} />
              Export
            </button>
            <NotificationBell />
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 pl-14 md:pl-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-5 pb-8">

          {/* Scouting Accountability Grid */}
          <ScoutingAccountability />

          {/* Teams Being Considered */}
          <div className="border-b-2 border-brand-yellow pb-2 mb-1">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Teams Being Considered</h2>
                <p className="text-xs text-gray-500">Alliance partner candidates</p>
              </div>
              <div className="flex items-center gap-2">
                {hasLeadTag && (
                  <button
                    onClick={() => setDeleteMode(!deleteMode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${deleteMode ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {deleteMode ? 'Done' : 'Delete Mode'}
                  </button>
                )}
                {hasLeadTag && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-brand-yellow/40 hover:bg-brand-yellow transition-colors text-gray-700"
                    title="Add team to considered"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {consideredTeams.map(t => (
            <div
              key={t.number}
              className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              {/* Team Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-brand-blue/30 to-brand-yellow/30 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">
                        {t.name} <span className="text-gray-500 font-medium">#{t.number}</span>
                      </h2>
                      {t.rank && (
                        <span className="text-sm text-gray-500">Rank {t.rank}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {deleteMode && hasLeadTag && (
                      <button
                        onClick={() => handleRemoveConsidered(t.number)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-500 hover:text-red-700 transition-colors"
                        title="Remove team"
                      >
                        <X size={16} />
                      </button>
                    )}
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-700">{t.scoutCount ? `${t.teleAvgMade} made` : '—'}</span>
                      <p className="text-xs text-gray-400">{t.scoutCount} scouted</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* The headline numbers, straight from what the scouting form
                    asks: ranking points ticked, pieces made in auto and teleop,
                    and whether they do an endgame. Nothing here comes from a
                    competition feed, because there is none. */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-100 pb-1">At a Glance <span className="font-normal text-gray-400">(from our scouting)</span></h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? t.rpPerMatch : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">RP / Match</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? t.autoAvgMade : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Auto Made / Match</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? t.teleAvgMade : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Teleop Made / Match</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? `${t.endgameSuccessPct}%` : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Does an Endgame</p>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-gray-500">Best match: <span className="font-semibold text-gray-700">{t.scoutCount ? `${t.bestMade} made` : '—'}</span>{t.scoutCount ? <> · Garden / match: <span className="font-semibold text-gray-700">{t.gardenAvg}</span></> : null}</span>
                  </div>
                </div>

                <ScoutPanel t={t} />

                <PitPanel visits={pitByTeam[t.number] || []} />

                {/* Responses Toggle */}
                <button
                  onClick={() => toggleExpand(t.number)}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-yellow-dark hover:text-gray-700 transition-colors px-3 py-1.5 bg-gray-50 rounded-lg"
                >
                  {expandedTeams[t.number] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expandedTeams[t.number] ? 'Hide' : 'View'} Scouting Responses ({t.scoutCount})
                </button>

                {expandedTeams[t.number] && (
                  <div className="space-y-2">
                    {t.matches.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No scouting responses yet.</p>
                    ) : (
                      t.matches.map((m, i) => (
                        <div key={m._id || i} className="bg-gray-50 rounded-lg p-3 text-xs space-y-1 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-700">
                              Match {m.matchNumber || '?'} &middot; {m.allianceColor || '?'} Alliance
                            </span>
                            {canDelete && m._id && (
                              <button
                                onClick={() => handleDelete(m._id)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="Delete response"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                          <div className="text-gray-500">
                            Start: {m.startingPosition || '?'} | Stability: {
                              m.robotStability === 'no' ? 'No issues' :
                              m.robotStability === 'major' ? 'Major breakdown' :
                              m.robotStability === 'shutdown' ? 'Shutdown' : '?'
                            }
                          </div>
                          <div className="text-gray-500">
                            Auto: {m.autoClassified || 0} classified, {m.autoArtifactsMissed || 0} missed, {m.autoOverflowed || 0} overflow, {m.autoInMotifOrder || 0} motif
                          </div>
                          <div className="text-gray-500">
                            Tele: {m.teleClassified || 0} classified, {m.teleArtifactsMissed || 0} missed, {m.teleOverflowed || 0} overflow, {m.teleInMotifOrder || 0} motif
                          </div>
                          {(m.roles || []).length > 0 && (
                            <div className="text-gray-500">Roles: {m.roles.join(', ')}</div>
                          )}
                          {m.observations && (
                            <div className="text-gray-400 italic">"{m.observations}"</div>
                          )}
                          {m._by && (
                            <div className="text-gray-400 pt-0.5">Submitted by {m._by}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* All Teams by Rank */}
          <div className="border-b-2 border-brand-blue pb-2 mb-1 mt-8">
            <h2 className="text-lg font-bold text-gray-800">All Teams by Rank</h2>
            <p className="text-xs text-gray-500">Ranked teams first, then by what we've scouted</p>
          </div>

          {otherTeams.map(t => (
            <div
              key={t.number}
              className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              {/* Team Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">
                      {t.name} <span className="text-gray-500 font-medium">#{t.number}</span>
                    </h2>
                    {t.rank && (
                      <span className="text-sm text-gray-500">Rank {t.rank}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-700">{t.scoutCount ? `${t.teleAvgMade} made` : '—'}</span>
                    <p className="text-xs text-gray-400">{t.scoutCount} scouted</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* The headline numbers, straight from what the scouting form
                    asks: ranking points ticked, pieces made in auto and teleop,
                    and whether they do an endgame. Nothing here comes from a
                    competition feed, because there is none. */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-100 pb-1">At a Glance <span className="font-normal text-gray-400">(from our scouting)</span></h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? t.rpPerMatch : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">RP / Match</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? t.autoAvgMade : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Auto Made / Match</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? t.teleAvgMade : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Teleop Made / Match</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{t.scoutCount ? `${t.endgameSuccessPct}%` : '—'}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Does an Endgame</p>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-gray-500">Best match: <span className="font-semibold text-gray-700">{t.scoutCount ? `${t.bestMade} made` : '—'}</span>{t.scoutCount ? <> · Garden / match: <span className="font-semibold text-gray-700">{t.gardenAvg}</span></> : null}</span>
                  </div>
                </div>

                <ScoutPanel t={t} />

                <PitPanel visits={pitByTeam[t.number] || []} />

                {/* Responses Toggle */}
                <button
                  onClick={() => toggleExpand(t.number)}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-yellow-dark hover:text-gray-700 transition-colors px-3 py-1.5 bg-gray-50 rounded-lg"
                >
                  {expandedTeams[t.number] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expandedTeams[t.number] ? 'Hide' : 'View'} Scouting Responses ({t.scoutCount})
                </button>

                {expandedTeams[t.number] && (
                  <div className="space-y-2">
                    {t.matches.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No scouting responses yet.</p>
                    ) : (
                      t.matches.map((m, i) => (
                        <div key={m._id || i} className="bg-gray-50 rounded-lg p-3 text-xs space-y-1 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-700">
                              Match {m.matchNumber || '?'} &middot; {m.allianceColor || '?'} Alliance
                            </span>
                            {canDelete && m._id && (
                              <button
                                onClick={() => handleDelete(m._id)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="Delete response"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                          <div className="text-gray-500">
                            Start: {m.startingPosition || '?'} | Stability: {
                              m.robotStability === 'no' ? 'No issues' :
                              m.robotStability === 'major' ? 'Major breakdown' :
                              m.robotStability === 'shutdown' ? 'Shutdown' : '?'
                            }
                          </div>
                          <div className="text-gray-500">
                            Auto: {m.autoClassified || 0} classified, {m.autoArtifactsMissed || 0} missed, {m.autoOverflowed || 0} overflow, {m.autoInMotifOrder || 0} motif
                          </div>
                          <div className="text-gray-500">
                            Tele: {m.teleClassified || 0} classified, {m.teleArtifactsMissed || 0} missed, {m.teleOverflowed || 0} overflow, {m.teleInMotifOrder || 0} motif
                          </div>
                          {(m.roles || []).length > 0 && (
                            <div className="text-gray-500">Roles: {m.roles.join(', ')}</div>
                          )}
                          {m.observations && (
                            <div className="text-gray-400 italic">"{m.observations}"</div>
                          )}
                          {m._by && (
                            <div className="text-gray-400 pt-0.5">Submitted by {m._by}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
    </>
  )
}

export default ScoutingData
