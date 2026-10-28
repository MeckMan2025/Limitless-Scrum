import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Trash2, Download } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import NotificationBell from './NotificationBell'

function TeamScoutingData() {
  const { username, teamNumber, isTeam } = useUser()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [sortField, setSortField] = useState('submitted_at')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    loadRecords()
  }, [teamNumber, username, isTeam])

  const loadRecords = async () => {
    setLoading(true)
    try {
      // Only for a visiting team: owner_team is how their rows are kept
      // apart from ours. Ours fall through to "mine", as they always have.
      if (isTeam && teamNumber) {
        const { data, error } = await supabase.from('scouting_records').select('*')
          .eq('owner_team', teamNumber)
          .order('submitted_at', { ascending: false })
        if (!error) {
          setRecords(data || [])
          setLoading(false)
          return
        }
      }
      // Fallback: filter by submitted_by containing the username
      const { data, error } = await supabase.from('scouting_records').select('*')
        .eq('submitted_by', username || '')
        .order('submitted_at', { ascending: false })
      if (error) throw error
      setRecords(data || [])
    } catch (err) {
      console.error('Failed to load scouting records:', err)
      setRecords([])
    }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this scouting record?')) return
    const { error } = await supabase.from('scouting_records').delete().eq('id', id)
    if (!error) {
      setRecords(prev => prev.filter(r => r.id !== id))
    }
  }

  const handleExport = () => {
    if (!records.length) return
    const rows = records.map(r => {
      const d = r.data || {}
      return {
        'Team #': d.teamNumber || '',
        'Match #': d.matchNumber || '',
        'Alliance': d.allianceColor || '',
        'Starting Position': d.startingPosition || '',
        'Auto Classified': d.autoClassified || 0,
        'Auto Missed': d.autoArtifactsMissed || 0,
        'Auto Overflowed': d.autoOverflowed || 0,
        'Auto Motif': d.autoInMotifOrder || 0,
        'Tele Classified': d.teleClassified || 0,
        'Tele Missed': d.teleArtifactsMissed || 0,
        'Tele Overflowed': d.teleOverflowed || 0,
        'Tele Motif': d.teleInMotifOrder || 0,
        'Tele Depot': d.teleArtifactsInDepot || 0,
        'Parking': d.parkingStatus || '',
        'Stability': d.robotStability || '',
        'Roles': (d.roles || []).join('; '),
        'Observations': d.observations || '',
        'Submitted By': r.submitted_by || '',
        'Submitted At': r.submitted_at || '',
      }
    })
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scouting-data-team${teamNumber || 'unknown'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sorted = [...records].sort((a, b) => {
    let aVal, bVal
    if (sortField === 'submitted_at') {
      aVal = a.submitted_at || ''
      bVal = b.submitted_at || ''
    } else if (sortField === 'teamNumber') {
      aVal = a.data?.teamNumber || ''
      bVal = b.data?.teamNumber || ''
    } else if (sortField === 'matchNumber') {
      aVal = a.data?.matchNumber || ''
      bVal = b.data?.matchNumber || ''
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <img src={`${import.meta.env.BASE_URL}ScrumLogo-transparent.png`} alt="Logo" className="w-20 h-20 drop-shadow-lg" />
      <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
        Stay Tuned!
      </h1>
      <p className="text-gray-500 max-w-sm">Scouting data will be available next season. Check back soon!</p>
    </div>
  )

}

export default TeamScoutingData
