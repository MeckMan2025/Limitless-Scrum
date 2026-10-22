import { useState, useEffect } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { ArrowLeft, RefreshCw } from 'lucide-react'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function TeamSurveyResponses({ onBack }) {
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/team_survey_responses?select=*&order=submitted_at.desc`,
        { headers: restHeaders() }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResponses(data || [])
    } catch (err) {
      console.error('Failed to load survey responses:', err)
    }
    setLoading(false)
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <h2 className="text-lg font-bold text-gray-800">Team Survey Responses</h2>
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 transition-colors ml-auto" title="Refresh">
            <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <img src="/ScrumLogo-transparent.png" alt="Loading" className="w-12 h-12 animate-spin" />
            <p className="text-sm text-gray-400 mt-3">Loading responses...</p>
          </div>
        ) : responses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No survey responses yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">{responses.length} response{responses.length !== 1 ? 's' : ''}</p>
            {responses.map((r, i) => (
              <div key={r.id || i} className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800">
                    {r.team_number ? `Team ${r.team_number}` : r.team_name || 'Unknown'}
                    {r.team_number && r.team_name ? ` — ${r.team_name}` : ''}
                  </span>
                  <span className="text-xs text-gray-400">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ''}
                  </span>
                </div>
                {r.usage_frequency && (
                  <div className="mb-1">
                    <span className="text-xs font-medium text-gray-500">Usage: </span>
                    <span className="text-sm text-gray-700">{r.usage_frequency}</span>
                  </div>
                )}
                {r.feature_request && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Feature request: </span>
                    <span className="text-sm text-gray-700">{r.feature_request}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TeamSurveyResponses
