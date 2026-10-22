import { useState, useEffect } from 'react'
import { onlyMyTeam, storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { ArrowLeft, Users, Trash2 } from 'lucide-react'
import { supabase } from '../supabase'

function InterestedTeams({ onBack, canDelete }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders({ 'Content-Type': 'application/json' })

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/interested_teams?${storedTeamScope()}&select=*&order=created_at.desc`,
          { headers }
        )
        if (res.ok) setSubmissions(await res.json())
      } catch (err) {
        console.error('Failed to load interested teams:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('interested-teams-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interested_teams' }, onlyMyTeam((payload) => {
        setSubmissions(prev => {
          if (prev.some(s => s.id === payload.new.id)) return prev
          return [payload.new, ...prev]
        })
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'interested_teams' }, onlyMyTeam((payload) => {
        setSubmissions(prev => prev.filter(s => s.id !== payload.old.id))
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleDelete = async (id) => {
    try {
      await fetch(`${supabaseUrl}/rest/v1/interested_teams?id=eq.${id}`, {
        method: 'DELETE',
        headers,
      })
      setSubmissions(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-2"
        >
          <ArrowLeft size={16} /> Back to Special Controls
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Users size={20} className="text-brand-blue-dark" />
          <h2 className="text-lg font-bold text-gray-800">Interested Teams</h2>
          <span className="ml-auto text-sm text-gray-400">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12">
            <Users size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">No teams have submitted interest yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div
                key={s.id}
                className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm p-4 flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-blue/40 to-brand-yellow/40 flex items-center justify-center flex-shrink-0">
                  <Users size={18} className="text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{s.team_name}</p>
                  <p className="text-gray-600 text-xs">{s.contact_name}</p>
                  <p className="text-gray-400 text-[11px] mt-1">
                    {new Date(s.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
                    })}
                  </p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default InterestedTeams
