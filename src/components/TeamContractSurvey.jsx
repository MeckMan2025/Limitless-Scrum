import { useState, useEffect } from 'react'
import { teamScope } from '../lib/teamScope'
import { lazyHeadersWith } from '../lib/restHeaders'
import { createPortal } from 'react-dom'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'

// A one-time, required survey shown on first login. Once a teammate submits, it
// never shows again (their answers are stored per-user in scouting_schedule, so
// the presence of their row is the "done" flag — no schema change needed).
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const headers = lazyHeadersWith({ 'Content-Type': 'application/json' })
const docId = (uid) => `team_contract_v1::${uid}`

const QUESTIONS = [
  { id: 'q1', type: 'paragraph', title: 'What does being an active and productive team member look like?' },
  { id: 'q2', type: 'checkbox', title: 'What should every team member be expected to do during meetings?',
    options: ['Stay focused on team work', 'Participate', 'Respect others', 'Help when needed', 'Take care of tools/equipment', 'Clean up'] },
  { id: 'q3', type: 'paragraph', title: 'What should our team rule be about doing homework, using phones, or working on unrelated activities during meetings?' },
  { id: 'q4', type: 'choice', title: 'What percentage of team meetings should members normally be expected to attend?',
    options: ['50%', '60%', '70%', '75%', '80%', '90%'] },
  { id: 'q5', type: 'paragraph', title: 'If someone accepts responsibility for a task but realizes they cannot finish it on time, what should they be expected to do?' },
  { id: 'q6', type: 'paragraph', title: 'How should team members communicate with each other about tasks, deadlines, absences, or problems?' },
  { id: 'q7', type: 'paragraph', title: 'How should two team members handle a disagreement or conflict?' },
  { id: 'q8', type: 'checkbox', title: 'If a conflict cannot be resolved between the people involved, who should they go to for help?',
    options: ['Team leader', 'Project manager', 'Mentor', 'Coach', 'Anonymous reporting option'] },
  { id: 'q9', type: 'checkbox', title: 'What should determine whether someone earns the opportunity to participate in competitions, league meets, or championships?',
    options: ['Attendance', 'Participation', 'Completing responsibilities', 'Teamwork', 'Behavior', 'Contribution to projects', 'Competition role'] },
  { id: 'q10', type: 'paragraph', title: 'What is the ONE rule or expectation you believe absolutely needs to be included in our team contract?' },
]

export default function TeamContractSurvey() {
  const { user, username } = useUser()
  const { isGuest, isTeam, myTeamNumber} = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [checked, setChecked] = useState(false)
  const [done, setDone] = useState(false)
  const [answers, setAnswers] = useState({})
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const eligible = !!user?.id && !isGuest && !isTeam

  useEffect(() => {
    if (!eligible) { setChecked(true); return }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`${url}/rest/v1/scouting_schedule?${SCOPE}&id=eq.${encodeURIComponent(docId(user.id))}&select=id`, { headers })
        const rows = res.ok ? await res.json() : []
        if (alive) { setDone(Array.isArray(rows) && rows.length > 0); setChecked(true) }
      } catch { if (alive) setChecked(true) }
    })()
    return () => { alive = false }
  }, [eligible, user?.id])

  if (!eligible || !checked || done) return null

  const setAns = (id, val) => setAnswers(a => ({ ...a, [id]: val }))
  const toggle = (id, opt) => setAnswers(a => {
    const cur = a[id] || []
    return { ...a, [id]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] }
  })

  const missing = (q) => {
    if (q.type === 'checkbox') return !(answers[q.id] || []).length && !(answers[q.id + '_other'] || '').trim()
    return !answers[q.id] || !String(answers[q.id]).trim()
  }

  const submit = async () => {
    if (QUESTIONS.some(missing)) { setShowErrors(true); return }
    setSubmitting(true); setError('')
    const resp = {}
    QUESTIONS.forEach(q => {
      if (q.type === 'checkbox') {
        const sel = answers[q.id] || []
        const other = (answers[q.id + '_other'] || '').trim()
        resp[q.id] = { q: q.title, a: other ? [...sel, other] : sel }
      } else {
        resp[q.id] = { q: q.title, a: answers[q.id] }
      }
    })
    try {
      const res = await fetch(`${url}/rest/v1/scouting_schedule`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates, return=minimal' },
        body: JSON.stringify({ id: docId(user.id), data: { name: username, answers: resp, at: new Date().toISOString() } }),
      })
      if (!res.ok) throw new Error('save failed')
      setDone(true)
    } catch {
      setError('Could not submit — check your connection and try again.')
      setSubmitting(false)
    }
  }

  const optRow = (q) => {
    if (q.type === 'choice') {
      const isOther = answers[q.id] && !q.options.includes(answers[q.id])
      return (
        <div className="space-y-1.5">
          {q.options.map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => setAns(q.id, opt)} /> {opt}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>Other:</span>
            <input type="text" value={isOther ? answers[q.id] : ''} placeholder="type here"
              onChange={e => setAns(q.id, e.target.value)}
              className="flex-1 px-2 py-1 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
          </label>
        </div>
      )
    }
    // checkbox
    return (
      <div className="space-y-1.5">
        {q.options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={(answers[q.id] || []).includes(opt)} onChange={() => toggle(q.id, opt)} /> {opt}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span>Other:</span>
          <input type="text" value={answers[q.id + '_other'] || ''} placeholder="type here"
            onChange={e => setAns(q.id + '_other', e.target.value)}
            className="flex-1 px-2 py-1 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent" />
        </label>
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-700">Team Contract — Quick Survey</h2>
          <p className="text-sm text-gray-500 mt-1">Before you get started, help shape our team contract. This is a one-time survey — it won't show again once you submit.</p>
        </div>
        <div className="px-5 py-4 space-y-5">
          {QUESTIONS.map((q, i) => (
            <div key={q.id}>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{i + 1}. {q.title}</label>
              {q.type === 'paragraph' ? (
                <textarea rows={2} value={answers[q.id] || ''} onChange={e => setAns(q.id, e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent ${showErrors && missing(q) ? 'border-red-400' : ''}`} />
              ) : (
                <div className={showErrors && missing(q) ? 'p-2 -m-2 rounded-lg ring-1 ring-red-300' : ''}>{optRow(q)}</div>
              )}
              {showErrors && missing(q) && <p className="text-xs text-red-500 mt-1">Please answer this one.</p>}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
          {error && <p className="text-xs text-red-500 mb-2 text-center">{error}</p>}
          <button onClick={submit} disabled={submitting}
            className="w-full py-2.5 rounded-xl font-bold text-gray-700 bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting…' : 'Submit & continue'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
