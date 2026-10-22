import { useState, useEffect, useCallback } from 'react'
import { Wrench, CheckCircle2, AlertTriangle, Plus, Trash2, X } from 'lucide-react'

const today = () => new Date().toISOString().slice(0, 10)

const DEFAULT_CHECKLIST = [
  { id: 1, label: 'Battery charged', checked: false },
  { id: 2, label: 'Bolts tight', checked: false },
  { id: 3, label: 'Sensors working', checked: false },
  { id: 4, label: 'Bumpers secure', checked: false },
  { id: 5, label: 'Radio connected', checked: false },
  { id: 6, label: 'Code deployed', checked: false },
]

function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(`pit_${today()}_${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveState(key, value) {
  localStorage.setItem(`pit_${today()}_${key}`, JSON.stringify(value))
}

function PitChecklist() {
  const [checklist, setChecklist] = useState(() => loadState('checklist', DEFAULT_CHECKLIST))
  const [issues, setIssues] = useState(() => loadState('issues', []))
  const [newIssue, setNewIssue] = useState('')
  const [notes, setNotes] = useState(() => loadState('notes', ''))

  // Persist on change
  useEffect(() => { saveState('checklist', checklist) }, [checklist])
  useEffect(() => { saveState('issues', issues) }, [issues])
  useEffect(() => { saveState('notes', notes) }, [notes])

  const toggleCheck = useCallback((id) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ))
  }, [])

  const resetChecklist = useCallback(() => {
    setChecklist(DEFAULT_CHECKLIST)
  }, [])

  const addIssue = useCallback(() => {
    const text = newIssue.trim()
    if (!text) return
    setIssues(prev => [
      ...prev,
      {
        id: Date.now(),
        text,
        resolved: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
    setNewIssue('')
  }, [newIssue])

  const toggleResolved = useCallback((id) => {
    setIssues(prev => prev.map(issue =>
      issue.id === id ? { ...issue, resolved: !issue.resolved } : issue
    ))
  }, [])

  const deleteIssue = useCallback((id) => {
    setIssues(prev => prev.filter(issue => issue.id !== id))
  }, [])

  const doneCount = checklist.filter(i => i.checked).length
  const totalCount = checklist.length

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="w-6 h-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-gray-800">Pit Crew Station</h1>
      </div>

      {/* ── Pre-Match Checklist ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-800">Pre-Match Checklist</h2>
          </div>
          <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
            doneCount === totalCount
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {doneCount}/{totalCount} complete
          </span>
        </div>

        <ul className="space-y-2">
          {checklist.map(item => (
            <li
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                item.checked
                  ? 'bg-green-50 text-green-700'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleCheck(item.id)}
                className="w-4 h-4 accent-green-500 pointer-events-none"
              />
              <span className={item.checked ? 'line-through opacity-70' : ''}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        <button
          onClick={resetChecklist}
          className="mt-3 text-sm text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
        >
          Reset for next match
        </button>
      </div>

      {/* ── Robot Issues Log ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-800">Robot Issues Log</h2>
        </div>

        {/* Add issue input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newIssue}
            onChange={e => setNewIssue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addIssue()}
            placeholder="Describe a robot issue..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={addIssue}
            disabled={!newIssue.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {issues.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No issues logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map(issue => (
              <li
                key={issue.id}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                  issue.resolved ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <button
                  onClick={() => toggleResolved(issue.id)}
                  title={issue.resolved ? 'Mark unresolved' : 'Mark resolved'}
                  className="mt-0.5 flex-shrink-0"
                >
                  {issue.resolved ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-red-400 hover:text-red-600" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <span className={`${issue.resolved ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {issue.text}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Logged at {issue.timestamp}
                  </span>
                </div>

                <button
                  onClick={() => deleteIssue(issue.id)}
                  title="Delete issue"
                  className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Parts / Tools Notes ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-gray-800">Parts / Tools Notes</h2>
        </div>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Note parts needed, tools location, spare batteries, etc..."
          rows={5}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <p className="text-xs text-gray-400 mt-1">Auto-saved to this device.</p>
      </div>
    </div>
  )
}

export default PitChecklist
