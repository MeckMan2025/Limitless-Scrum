import { useState, useEffect, useCallback, useMemo } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { lazyRestHeaders } from '../lib/restHeaders'
import { ClipboardCheck, RefreshCw } from 'lucide-react'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const REST_HEADERS = lazyRestHeaders

async function restGet(path) {
  const res = await fetch(`${REST_URL}/rest/v1/${path}`, { headers: REST_HEADERS })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

export default function ScoutingAccountability({ sessionId }) {
  const [session, setSession] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [scoutingRecords, setScoutingRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setError('')
      setLoading(true)

      // Resolve which session to show
      let sid = sessionId
      if (!sid) {
        // Try active session first, then most recent
        const active = await restGet(`comp_day_sessions?${storedTeamScope()}&is_active=eq.true&limit=1`)
        if (active.length > 0) {
          sid = active[0].id
          setSession(active[0])
        } else {
          const recent = await restGet(`comp_day_sessions?${storedTeamScope()}&order=created_at.desc&limit=1`)
          if (recent.length > 0) {
            sid = recent[0].id
            setSession(recent[0])
          } else {
            setSession(null)
            setBlocks([])
            setAssignments([])
            setScoutingRecords([])
            setLoading(false)
            return
          }
        }
      } else {
        const sessions = await restGet(`comp_day_sessions?id=eq.${sid}`)
        setSession(sessions[0] || null)
      }

      // Fetch blocks, scouting assignments, and scouting records in parallel
      const [blks, assigns] = await Promise.all([
        restGet(`comp_day_blocks?session_id=eq.${sid}&order=order_index.asc`),
        restGet(`comp_day_assignments?session_id=eq.${sid}&role=eq.scouting`),
      ])

      setBlocks(blks)
      setAssignments(assigns)

      // Fetch scouting records for the session date
      // Use the session date to scope records
      const sessionData = await restGet(`comp_day_sessions?id=eq.${sid}&select=session_date`)
      if (sessionData.length > 0 && sessionData[0].session_date) {
        const date = sessionData[0].session_date
        const records = await restGet(`scouting_records?submitted_at=gte.${date}T00:00:00&submitted_at=lt.${date}T23:59:59&select=id,submitted_by,submitted_at`)
        setScoutingRecords(records)
      } else {
        setScoutingRecords([])
      }
    } catch (err) {
      console.error('ScoutingAccountability fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { fetchData() }, [fetchData])

  // Build the matrix data
  const { scoutMembers, matrix, memberStats } = useMemo(() => {
    // Get unique members assigned to scouting
    const memberSet = new Set(assignments.map(a => a.username))
    const scoutMembers = [...memberSet].sort()

    // Count submissions per member
    const submissionsByMember = {}
    scoutingRecords.forEach(r => {
      submissionsByMember[r.submitted_by] = (submissionsByMember[r.submitted_by] || 0) + 1
    })

    // Build matrix: for each member+block, did they submit?
    // We distribute submissions across blocks in order — first N submissions cover first N assigned blocks
    const matrix = {}
    const memberStats = {}

    scoutMembers.forEach(member => {
      const memberBlocks = assignments
        .filter(a => a.username === member)
        .map(a => a.block_id)
      const totalAssigned = memberBlocks.length
      const totalSubmitted = submissionsByMember[member] || 0

      matrix[member] = {}
      // Mark blocks as submitted based on submission count
      memberBlocks.forEach((blockId, idx) => {
        matrix[member][blockId] = idx < totalSubmitted
      })

      const completed = Math.min(totalSubmitted, totalAssigned)
      memberStats[member] = {
        assigned: totalAssigned,
        submitted: completed,
        pct: totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0,
      }
    })

    return { scoutMembers, matrix, memberStats }
  }, [assignments, blocks, scoutingRecords])

  // Only show blocks that have at least one scouting assignment
  const scoutBlocks = useMemo(() => {
    const blockIds = new Set(assignments.map(a => a.block_id))
    return blocks.filter(b => blockIds.has(b.id))
  }, [blocks, assignments])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center text-gray-400 gap-2">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Loading scouting data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
        <p className="text-sm text-red-600">Error loading scouting accountability: {error}</p>
        <button onClick={fetchData} className="text-xs text-red-500 underline mt-1">Retry</button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-400">No competition day sessions found.</p>
      </div>
    )
  }

  if (scoutMembers.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ClipboardCheck size={16} className="text-blue-500" />
          <h3 className="font-semibold text-gray-700">Scouting Accountability</h3>
        </div>
        <p className="text-sm text-gray-400">No scouting assignments for "{session.name}".</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          <ClipboardCheck size={16} className="text-blue-500" />
          Scouting Accountability
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{session.name}</span>
          <button onClick={fetchData} className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 bg-gray-50 rounded-tl-lg sticky left-0 z-10 min-w-[120px]">
                Member
              </th>
              {scoutBlocks.map(block => (
                <th key={block.id} className="py-2 px-3 text-xs font-semibold text-gray-500 bg-gray-50 text-center whitespace-nowrap">
                  {block.name}
                </th>
              ))}
              <th className="py-2 px-3 text-xs font-semibold text-gray-500 bg-gray-50 rounded-tr-lg text-center">
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {scoutMembers.map((member, idx) => {
              const stats = memberStats[member]
              const isLast = idx === scoutMembers.length - 1
              return (
                <tr key={member} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className={`py-2 px-3 font-medium text-gray-700 sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${isLast ? 'rounded-bl-lg' : ''}`}>
                    {member}
                  </td>
                  {scoutBlocks.map(block => {
                    const isAssigned = assignments.some(a => a.username === member && a.block_id === block.id)
                    if (!isAssigned) {
                      return (
                        <td key={block.id} className="py-2 px-3 text-center">
                          <span className="text-gray-300">—</span>
                        </td>
                      )
                    }
                    const submitted = matrix[member]?.[block.id]
                    return (
                      <td key={block.id} className="py-2 px-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${
                          submitted
                            ? 'bg-green-100 border border-green-300'
                            : 'bg-red-50 border border-red-200'
                        }`}>
                          {submitted ? '\u2705' : '\u274C'}
                        </span>
                      </td>
                    )
                  })}
                  <td className={`py-2 px-3 text-center ${isLast ? 'rounded-br-lg' : ''}`}>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                      stats.pct === 100
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : stats.pct >= 50
                        ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                        : 'bg-red-100 text-red-600 border border-red-200'
                    }`}>
                      {stats.submitted}/{stats.assigned} ({stats.pct}%)
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <td className="py-2 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                Summary
              </td>
              {scoutBlocks.map(block => {
                const blockAssigns = assignments.filter(a => a.block_id === block.id)
                const completed = blockAssigns.filter(a => matrix[a.username]?.[block.id]).length
                const total = blockAssigns.length
                return (
                  <td key={block.id} className="py-2 px-3 text-center">
                    <span className={`text-xs font-semibold ${
                      total > 0 && completed === total ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {completed}/{total}
                    </span>
                  </td>
                )
              })}
              <td className="py-2 px-3 text-center">
                {(() => {
                  const totalAssigned = Object.values(memberStats).reduce((s, m) => s + m.assigned, 0)
                  const totalSubmitted = Object.values(memberStats).reduce((s, m) => s + m.submitted, 0)
                  const overallPct = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 0
                  return (
                    <span className={`text-xs font-bold ${
                      overallPct === 100 ? 'text-green-600' : overallPct >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {overallPct}%
                    </span>
                  )
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Scouting blocks assigned vs. records submitted on {session.session_date}
      </p>
    </div>
  )
}
