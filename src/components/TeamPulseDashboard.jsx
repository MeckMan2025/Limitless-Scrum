import { useEffect, useMemo, useState } from 'react'
import { storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { ArrowLeft } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MOOD_LABELS = {
  great:    '🙂 Great',
  okay:     '😐 Okay',
  stressed: '😓 Stressed',
  excited:  '🔥 Excited',
  tired:    '😴 Tired',
}

const WORK_LABELS = {
  programming: '💻 Programming',
  technical:   '🔧 Technical',
  business:    '💰 Business',
  outreach:    '📣 Outreach',
  competition: '🏁 Competition',
  workshop:    '📚 Workshop',
  multiple:    '🤖 Multiple',
  not_sure:    '❌ Not Sure',
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function nDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function TeamPulseDashboard({ onBack }) {
  const [range, setRange] = useState(7) // days
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const from = nDaysAgo(range - 1)
    // Deliberately NEVER select user_id — keep responses anonymous to leaders
    fetch(
      `${supabaseUrl}/rest/v1/daily_pulse?${storedTeamScope()}&pulse_date=gte.${from}&select=mood,mood_note,work_focus,frustration,frustration_note,pulse_date,created_at&order=created_at.desc`,
      { headers: restHeaders() },
    )
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) { setRows(Array.isArray(data) ? data : []); setLoading(false) } })
      .catch(() => { if (!cancelled) { setRows([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [range])

  const moodCounts = useMemo(() => tally(rows, 'mood', MOOD_LABELS), [rows])
  const workCounts = useMemo(() => tally(rows, 'work_focus', WORK_LABELS), [rows])
  const frustrationCounts = useMemo(() => tallyTopN(rows, 'frustration', 8), [rows])
  const notes = useMemo(() => {
    const all = []
    rows.forEach(r => {
      if (r.mood_note && r.mood_note.trim()) all.push({ kind: 'mood', text: r.mood_note.trim(), date: r.pulse_date })
      if (r.frustration_note && r.frustration_note.trim()) all.push({ kind: 'frustration', text: r.frustration_note.trim(), date: r.pulse_date })
    })
    return all
  }, [rows])

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-5">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Team Pulse</h2>
            <p className="text-xs text-gray-400">Anonymous trend data — no individual names ever shown</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  range === d ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Last {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-10">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10 bg-white rounded-2xl border border-gray-100">
            No responses yet for this period.
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">{rows.length} response{rows.length === 1 ? '' : 's'} in the last {range} days</p>

            <Card title="Mood">
              <CountList data={moodCounts} />
            </Card>

            <Card title="Work Focus">
              <ChartBlock data={workCounts} color="#6cb2ff" />
            </Card>

            <Card title="Top Frustrations">
              <CountList data={frustrationCounts} />
            </Card>

            {notes.length > 0 && (
              <Card title={`Anonymous Notes (${notes.length})`}>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {notes.map((n, i) => (
                    <div key={i} className="text-sm text-gray-700 px-3 py-2 bg-gray-50 rounded-lg">
                      <span className={`text-[10px] uppercase font-semibold tracking-wider mr-2 ${
                        n.kind === 'mood' ? 'text-brand-blue-dark' : 'text-brand-silver-dark'
                      }`}>{n.kind}</span>
                      <span className="text-[10px] text-gray-400 mr-2">{n.date}</span>
                      {n.text}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function CountList({ data }) {
  if (data.length === 0) return <p className="text-xs text-gray-400">No data</p>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.key} className="flex items-center gap-3 text-sm">
          <div className="w-32 sm:w-40 truncate text-gray-700">{d.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-blue-dark to-brand-yellow-dark"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <div className="w-8 text-right text-gray-500 tabular-nums">{d.count}</div>
        </div>
      ))}
    </div>
  )
}

function ChartBlock({ data, color }) {
  if (data.length === 0) return <p className="text-xs text-gray-400">No data</p>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.map(d => ({ name: d.label, count: d.count }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function tally(rows, field, labels) {
  const counts = {}
  for (const r of rows) {
    const v = r[field]
    if (!v) continue
    counts[v] = (counts[v] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: labels[key] || key, count }))
}

function tallyTopN(rows, field, n) {
  const counts = {}
  for (const r of rows) {
    const v = r[field]
    if (!v) continue
    counts[v] = (counts[v] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, label: key[0].toUpperCase() + key.slice(1), count }))
}
