import { useState, useEffect, useRef, Fragment } from 'react'
import { storedTeamScope, teamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { fetchMyTasks } from '../lib/taskTeams'
import { SEASON_GOALS } from '../lib/seasonGoals'
import { BookOpen, Calendar, ArrowRight, Camera, Lightbulb, Send, Trash2, Check, X, Plus, ChevronLeft, ChevronRight, Target, Bot, ClipboardCheck, Grid3x3 } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { supabase } from '../supabase'
import NotificationBell from './NotificationBell'
import NotebookGallery from './NotebookGallery'
import { uploadImageFile } from '../lib/photos'
import { HOME_TEAM_NUMBER } from '../data/team'

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-600',
}

// Season kickoff date — change this to your real kickoff date/time.
const SEASON_KICKOFF = new Date('2026-09-12T09:00:00')
const FIRST_MEET = new Date('2026-10-19T09:00:00')

// The numbers a goal is actually measured by — percentages, counts, ranges and
// the month it's due — so the target can be found without reading the sentence
// twice. Order matters: percentages before bare numbers, or 90% underlines as
// just "90".
const MEASURE_RE = /(\d+(?:\.\d+)?%|\b\d+\s*-\s*\d+\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b\.?(?:\s*\d{1,2})?|\b\d+\b)/

function markMeasures(text) {
  // split() with a capturing group leaves the matches at the odd indices, so
  // there's no need to re-test each piece to know which ones matched.
  return text.split(MEASURE_RE).map((part, i) =>
    i % 2 === 1
      ? <u key={i} className="font-bold text-gray-800 decoration-amber-800 decoration-2 underline-offset-2">{part}</u>
      : part
  )
}

// Honeycomb, after the BioBuzz comb: flat-top cells in mixed honey tones. The
// logo's black walls are what make it read as a badge; behind a page of text
// that would fight everything on top of it, so the walls here are soft amber
// and the whole thing is faint. Generated flat-top hexagons on a 3r x sqrt(3)r
// tile, which is the smallest patch of a honeycomb that repeats seamlessly.
export const HONEYCOMB_CELLS = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='52' viewBox='0 0 90.00 51.96'%3E%3Cpolygon points='30.00,25.98 15.00,51.96 -15.00,51.96 -30.00,25.98 -15.00,0.00 15.00,0.00' fill='%23fde68a' fill-opacity='0.55'/%3E%3Cpolygon points='75.00,0.00 60.00,25.98 30.00,25.98 15.00,0.00 30.00,-25.98 60.00,-25.98' fill='%23fef3c7' fill-opacity='0.55'/%3E%3Cpolygon points='75.00,51.96 60.00,77.94 30.00,77.94 15.00,51.96 30.00,25.98 60.00,25.98' fill='%23fef3c7' fill-opacity='0.55'/%3E%3Cpolygon points='120.00,25.98 105.00,51.96 75.00,51.96 60.00,25.98 75.00,0.00 105.00,0.00' fill='%23f8d77a' fill-opacity='0.55'/%3E%3Cpolygon points='30.00,25.98 15.00,51.96 -15.00,51.96 -30.00,25.98 -15.00,0.00 15.00,0.00' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3Cpolygon points='75.00,0.00 60.00,25.98 30.00,25.98 15.00,0.00 30.00,-25.98 60.00,-25.98' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3Cpolygon points='75.00,51.96 60.00,77.94 30.00,77.94 15.00,51.96 30.00,25.98 60.00,25.98' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3Cpolygon points='120.00,25.98 105.00,51.96 75.00,51.96 60.00,25.98 75.00,0.00 105.00,0.00' fill='none' stroke='%23e0a92e' stroke-opacity='0.45' stroke-width='2.5'/%3E%3C/svg%3E\")"

// The honey the comb sits in.
export const HONEY_WASH = 'linear-gradient(160deg, #fffdf5 0%, #fff8e7 45%, #fdf0d5 100%)'

// Little flowers where the task bullets go, cycling the team's three colours.
// Drawn rather than an emoji so they sit on the baseline and take the colours.
// Petals carry the colour, the middle is always yellow — that's what makes a
// shape read as a flower rather than as a coloured blob.
const FLOWER_PETALS = ['#FFE27A', '#8FB8FF', '#D9DEE6'] // pink, blue, orange
const FLOWER_HEART = '#F6C445'
const FLOWER_HEART_EDGE = '#E0A92E'

function Flower({ i = 0, size = 18 }) {
  const petal = FLOWER_PETALS[i % FLOWER_PETALS.length]
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse key={a} cx="10" cy="5.2" rx="3.1" ry="4.3" fill={petal} transform={`rotate(${a} 10 10)`} />
      ))}
      <circle cx="10" cy="10" r="2.9" fill={FLOWER_HEART} stroke={FLOWER_HEART_EDGE} strokeWidth="0.7" />
    </svg>
  )
}

function HomeView({ onTabChange, onOpenTask, onOpenSpecial }) {
  const { username, user, functionTags } = useUser()
  const { isGuest, hasLeadTag, myTeamNumber } = usePermissions()

  const SCOPE = teamScope(myTeamNumber)
  // Our Goals is Radical's own season goals, hard-coded in lib/seasonGoals.
  // Prime Suspects has its own season and isn't measured against ours, so
  // showing them there would be wrong rather than merely irrelevant. My Tasks
  // takes the full width instead of leaving a gap where the note was.
  const isHomeTeam = !myTeamNumber || myTeamNumber === HOME_TEAM_NUMBER
  const showGoals = isHomeTeam

  const [nextEvent, setNextEvent] = useState(null)
  const [eventLoading, setEventLoading] = useState(true)
  const [compDayActive, setCompDayActive] = useState(false)
  const [compDayPreview, setCompDayPreview] = useState(null) // { sessionName, roles: [{blockName, role, emoji}] }
  const [quote, setQuote] = useState(null)
  const [ideas, setIdeas] = useState([])
  const [newIdea, setNewIdea] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const fileInputRef = useRef(null)
  const scrollRef = useRef(null)
  const [myTasks, setMyTasks] = useState([])
  const [myTaskTotal, setMyTaskTotal] = useState(0)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders()

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || supabaseKey
    return { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
  }

  const ROLE_EMOJIS = { 'scouting': '🔍', 'pit-crew': '🔧', 'drive-team': '🎮', 'spirit': '📣', 'bag-watch': '🎒', 'break': '☕', 'strategy': '🧠', 'safety': '🦺' }
  const ROLE_LABELS = { 'scouting': 'Scouting', 'pit-crew': 'Pit Crew', 'drive-team': 'Drive Team', 'spirit': 'Spirit', 'bag-watch': 'Bag Watch', 'break': 'Break', 'strategy': 'Strategy Lead', 'safety': 'Safety Monitor' }

  // Load the tasks assigned to me from the Scrum board (active tasks only)
  useEffect(() => {
    async function loadMyTasks() {
      if (!username) { setMyTasks([]); setMyTaskTotal(0); return }
      try {
        // Mine, plus anything given to everyone, plus anything given to a side
        // of the team I'm on — a Business task is a task for the business team.
        const res = await fetchMyTasks(supabaseUrl, headers, username, functionTags)
        if (!res.ok) return
        const data = await res.json()

        // ...but only from my own team's boards.
        //
        // That query matches on assignee and side and nothing else, so a task
        // given to Everyone showed up on every team's dashboard: Radical's
        // "Decide Awards" was sitting on the Prime Suspects home page.
        //
        // tasks has no team column of its own yet (supabase/task_owner_team.sql
        // is still unrun), so the board is what says whose task it is. Boards
        // do carry owner_team, so this asks for mine and keeps only tasks filed
        // on them. If that lookup fails we keep the old behaviour rather than
        // showing an empty list.
        let mineBoards = null
        try {
          const bres = await fetch(
            `${supabaseUrl}/rest/v1/boards?select=id&${storedTeamScope('owner_team')}`,
            { headers },
          )
          if (bres.ok) mineBoards = new Set((await bres.json()).map(b => b.id))
        } catch { /* keep mineBoards null */ }

        const onMyBoards = (t) => !mineBoards || !t.board_id || mineBoards.has(t.board_id)
        const active = (Array.isArray(data) ? data : [])
          .filter(onMyBoards)
          .filter(t => t.status !== 'done' && t.status !== 'completed')

        // Most urgent first, per the kickoff plan: soonest due (so overdue rises
        // to the top), then priority, then whatever is closest to finishing.
        // Undated tasks sink rather than jumping the queue.
        const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }
        const PROGRESS = { todo: 0, '25': 25, '50': 50, '75': 75 }
        const dueValue = (t) => {
          const [y, m, d] = String(t.due_date || '').split('-').map(Number)
          return (y && m && d) ? new Date(y, m - 1, d).getTime() : Infinity
        }
        active.sort((a, b) =>
          dueValue(a) - dueValue(b) ||
          (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
          (PROGRESS[b.status] ?? 0) - (PROGRESS[a.status] ?? 0) ||
          String(a.title).localeCompare(String(b.title))
        )
        // Page shows only the three that matter most, ranked by the task's
        // priority setting first (critical > high > medium > low), then by how
        // soon it's due. Display keeps the page's least-urgent-first order.
        const byImportance = [...active].sort((a, b) =>
          (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
          dueValue(a) - dueValue(b)
        )
        const topThree = new Set(byImportance.slice(0, 3).map(t => t.id))
        setMyTasks(active.filter(t => topThree.has(t.id)))
        setMyTaskTotal(active.length)
      } catch (err) {
        console.error('Failed to load assigned tasks:', err)
      }
    }
    loadMyTasks()

    // Re-read on any task change so finishing one makes it drop off this page
    // immediately, instead of lingering until the next reload.
    const ch = supabase
      .channel('home-my-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadMyTasks)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [username])

  // Check for active/upcoming comp day session + role preview
  useEffect(() => {
    const fetchCompDay = async () => {
      try {
        // Check active session
        const activeRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_sessions?${SCOPE}&is_active=eq.true&limit=1&select=id`, { headers })
        const activeData = await activeRes.json()
        setCompDayActive(Array.isArray(activeData) && activeData.length > 0)

        // Find upcoming or most recent session for role preview
        if (!username) return
        const sessRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_sessions?${SCOPE}&order=created_at.desc&limit=1&select=id,name,session_date`, { headers })
        const sessions = await sessRes.json()
        if (!Array.isArray(sessions) || sessions.length === 0) return

        const session = sessions[0]
        // Get my assignments for this session
        const assignRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_assignments?${SCOPE}&session_id=eq.${session.id}&username=eq.${encodeURIComponent(username)}&select=role,block_id`, { headers })
        const assigns = await assignRes.json()
        if (!Array.isArray(assigns) || assigns.length === 0) { setCompDayPreview(null); return }

        // Get block names
        const blockIds = [...new Set(assigns.map(a => a.block_id))]
        const blocksRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_blocks?${SCOPE}&session_id=eq.${session.id}&order=order_index.asc&select=id,name`, { headers })
        const blocks = await blocksRes.json()
        const blockMap = Object.fromEntries((blocks || []).map(b => [b.id, b.name]))

        setCompDayPreview({
          sessionName: session.name,
          sessionDate: session.session_date,
          roles: assigns.map(a => ({ blockName: blockMap[a.block_id] || '?', role: a.role, emoji: ROLE_EMOJIS[a.role] || '❓', label: ROLE_LABELS[a.role] || a.role })),
        })
      } catch { setCompDayActive(false) }
    }
    fetchCompDay()
  }, [username])

  // Fetch next event + quote
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]

    fetch(`${supabaseUrl}/rest/v1/calendar_events?${SCOPE}&date_key=gte.${today}&order=date_key.asc&limit=1&select=*`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setNextEvent(data && data.length > 0 ? data[0] : null)
        setEventLoading(false)
      })
      .catch(() => setEventLoading(false))

    fetch(`${supabaseUrl}/rest/v1/fun_quotes?${SCOPE}&approved=eq.true&select=*`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (data && data.length > 0) {
          setQuote(data[Math.floor(Math.random() * data.length)])
        }
      })
      .catch(() => {})
  }, [])

  // Fetch photos
  //
  // season_photos has no team column, so there is no way to ask for one team's
  // photos — the query returns everybody's or nobody's. Until it has one, a
  // team that isn't ours gets nobody's: showing them Radical's season would be
  // the exact thing team separation is for. Giving them their own needs a
  // migration, not a filter.
  const loadPhotos = async () => {
    if (!isHomeTeam) { setPhotos([]); return }
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/season_photos?${SCOPE}&select=*&order=created_at.desc`, { headers })
      if (res.ok) setPhotos(await res.json())
    } catch {}
  }

  useEffect(() => { loadPhotos() }, [isHomeTeam]) // eslint-disable-line

  // Upload photo
  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    try {
      // Shrunk and cached for a year — see lib/photos.js.
      let publicUrl
      try {
        publicUrl = await uploadImageFile(supabaseUrl, supabaseKey, 'season-photos', file)
      } catch (err) {
        console.error('Upload failed:', err.message)
        setUploading(false)
        return
      }

      // Save record
      await fetch(`${supabaseUrl}/rest/v1/season_photos`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          url: publicUrl,
          caption: '',
          uploaded_by: username,
        }),
      })

      loadPhotos()
    } catch (err) {
      console.error('Upload error:', err)
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Delete photo
  const handleDeletePhoto = async (photo) => {
    // Extract filename from URL
    const fileName = photo.url.split('/season-photos/').pop()

    // Delete from storage
    await fetch(`${supabaseUrl}/storage/v1/object/season-photos/${fileName}`, {
      method: 'DELETE',
      headers: restHeaders(),
    }).catch(() => {})

    // Delete record
    await fetch(`${supabaseUrl}/rest/v1/season_photos?id=eq.${photo.id}`, {
      method: 'DELETE',
      headers,
    })

    setSelectedPhoto(null)
    loadPhotos()
  }

  // Fetch workshop ideas
  const loadIdeas = async () => {
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/rest/v1/workshop_ideas?${SCOPE}&select=*&order=created_at.desc`, { headers: authHeaders })
      if (res.ok) setIdeas(await res.json())
    } catch {}
  }

  useEffect(() => { loadIdeas() }, [])

  const handleSubmitIdea = async () => {
    const text = newIdea.trim()
    if (!text) return
    setSubmitError('')
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/rest/v1/workshop_ideas`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          idea: text,
          submitted_by: username,
          user_id: user?.id,
          status: 'pending',
        }),
      })
      if (res.ok) {
        setNewIdea('')
        loadIdeas()
      } else {
        setSubmitError('Failed to submit.')
      }
    } catch {
      setSubmitError('Failed to submit.')
    }
  }

  const handleReview = async (id, status) => {
    const authHeaders = await getAuthHeaders()
    await fetch(`${supabaseUrl}/rest/v1/workshop_ideas?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status }),
    })
    loadIdeas()
  }

  const handleDeleteIdea = async (id) => {
    const authHeaders = await getAuthHeaders()
    await fetch(`${supabaseUrl}/rest/v1/workshop_ideas?id=eq.${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    loadIdeas()
  }

  const daysUntil = nextEvent ? Math.ceil((new Date(nextEvent.date_key) - new Date()) / (1000 * 60 * 60 * 24)) : null

  // Mini week calendar data
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: d, key, dayName: d.toLocaleDateString('en-US', { weekday: 'short' }), dayNum: d.getDate(), isToday: i === dayOfWeek }
  })

  // Fetch events for this week
  const [weekEvents, setWeekEvents] = useState({})
  useEffect(() => {
    const startKey = weekDays[0].key
    const endKey = weekDays[6].key
    fetch(`${supabaseUrl}/rest/v1/calendar_events?${SCOPE}&date_key=gte.${startKey}&date_key=lte.${endKey}&select=id,name,date_key,event_type`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const grouped = {}
        data.forEach(ev => {
          if (!grouped[ev.date_key]) grouped[ev.date_key] = []
          grouped[ev.date_key].push(ev)
        })
        setWeekEvents(grouped)
      })
      .catch(() => {})
  }, [])

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const canReview = hasLeadTag
  const canSubmit = !isGuest


  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-gold-dark via-brand-silver-dark to-brand-silver-dark bg-clip-text text-transparent">
              Home Page
            </h1>
            <p className="text-sm text-gray-300">
              Welcome back{username ? `, ${username}` : ''}! <span title="Season kickoff">🐝</span>
            </p>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main
        className="flex-1 p-4 overflow-y-auto space-y-4"
        style={{
          backgroundImage: `${HONEYCOMB_CELLS}, ${HONEY_WASH}`,
          backgroundAttachment: 'local',
        }}
      >
        {/* Mini Week Calendar */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Week</h2>
            <button
              onClick={() => onTabChange('calendar')}
              className="text-xs text-brand-gold-dark hover:underline flex items-center gap-0.5"
            >
              Full Calendar <ArrowRight size={10} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const dayEvts = weekEvents[day.key] || []
              const hasEvents = dayEvts.length > 0
              const isPast = day.date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
              return (
                <div
                  key={day.key}
                  className={`flex flex-col items-center py-2 rounded-lg transition-colors ${
                    day.isToday
                      ? 'bg-brand-gold/30 ring-2 ring-brand-gold-dark/40'
                      : isPast
                        ? 'opacity-40'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="text-[10px] text-gray-400 font-medium">{day.dayName}</span>
                  <span className={`text-sm font-semibold mt-0.5 ${day.isToday ? 'text-brand-gold-dark' : 'text-gray-700'}`}>
                    {day.dayNum}
                  </span>
                  {hasEvents && (
                    <div className="flex gap-0.5 mt-1">
                      {dayEvts.slice(0, 3).map(ev => {
                        const colors = { meeting: 'bg-brand-gold-dark', competition: 'bg-brand-silver-dark', other: 'bg-brand-silver-dark' }
                        return <span key={ev.id} className={`w-1 h-1 rounded-full ${colors[ev.event_type] || colors.other}`} />
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* One row of shortcut tiles. Leads, mentors and coaches also get the
            two pages used during a meeting. */}
        {(() => {
          const tiles = [
            ...(hasLeadTag ? [
              { view: 'attendance',    label: 'Attendance',    icon: ClipboardCheck, ring: 'border-brand-gold',   tint: 'bg-brand-gold/20',   text: 'text-brand-gold-dark' },
              { view: 'design-matrix', label: 'Decision Matrix', icon: Grid3x3,        ring: 'border-brand-silver', tint: 'bg-brand-silver/20', text: 'text-brand-silver-dark' },
            ] : []),
            // A tab of its own rather than a Special Controls page, so this one
            // switches tabs instead of opening a special view.
            { tab: 'ai-manual', label: 'AI Manual', icon: Bot, ring: 'border-brand-gold', tint: 'bg-brand-gold/20', text: 'text-brand-gold-dark' },
            // Not for guests — the notebook is teammate-only, and a tile that
            // lands on "access restricted" is worse than no tile.
            ...(isGuest ? [] : [
              { tab: 'notebook', label: 'Engineering Notebook', icon: BookOpen, ring: 'border-brand-yellow', tint: 'bg-brand-yellow/20', text: 'text-brand-yellow-dark' },
            ]),
          ]
          // All on one row, however many there are, so the row sizes itself to
          // whatever this person can reach.
          return (
            <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
              {tiles.map(({ view, tab, label, icon: Icon, ring, tint, text }) => (
                <button
                  key={view || tab}
                  onClick={() => tab ? onTabChange?.(tab) : onOpenSpecial?.(view)}
                  title={label}
                  className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-xl border-2 ${ring} ${tint} bg-white/70 shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-[0.98] transition-all`}
                >
                  <Icon size={18} className={`${text} shrink-0`} />
                  <span className="text-[11px] sm:text-xs font-bold text-gray-700 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          )
        })()}

        {/* My Tasks and the season's goals, side by side — or My Tasks alone,
            full width, on a team that doesn't share our goals. */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch">

          <section className="w-full md:flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-h-[240px] max-h-[442px] overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Target size={18} className="text-brand-gold-dark" />
                <h2 className="font-semibold text-gray-700">My Tasks</h2>
                {myTaskTotal > myTasks.length && (
                  <span className="ml-auto text-xs text-gray-400">
                    +{myTaskTotal - myTasks.length} more
                  </span>
                )}
              </div>
              <div className="mt-1 relative flex-1">
                {myTasks.length === 0 && (
                  <div className="flex items-center h-[46px] border-b border-gray-100">
                    <span className="text-sm text-gray-400">Nothing assigned yet</span>
                  </div>
                )}
                {myTasks.map((task, i) => {
                  // Overdue rows get a highlighter stripe so they stand out on
                  // the page instead of only the date turning red.
                  const [dy, dm, dd] = String(task.due_date || '').split('-').map(Number)
                  const dueDate = (dy && dm && dd) ? new Date(dy, dm - 1, dd) : null
                  const now = new Date()
                  const isOverdue = dueDate && dueDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  return (
                  <Fragment key={task.id}>
                  <div
                    className={`flex items-center gap-2.5 h-[46px] border-b border-gray-100 ${isOverdue ? 'border-l-2 border-l-amber-800 -ml-2 pl-1.5' : ''}`}
                  >
                    {/* The bullet. Progress is the number further along the
                        row, so this doesn't need to show it twice. */}
                    <Flower i={i} />
                    <span
                      className={`flex-1 text-sm font-medium truncate ${isOverdue ? 'text-amber-900' : 'text-gray-700'}`}
                    >
                      {task.title}
                    </span>
                    {(() => {
                      const PCT = { todo: 0, '25': 25, '50': 50, '75': 75, done: 100, completed: 100 }
                      const pct = PCT[task.status] ?? 0
                      return (
                        <span
                          className={`shrink-0 text-xs font-semibold ${pct === 100 ? 'text-green-600' : 'text-gray-400'}`}
                        >
                          {pct}%
                        </span>
                      )
                    })()}
                    {/* Due date in the margin — red once it's past. */}
                    {dueDate && (
                      <span
                        className={`shrink-0 text-xs ${isOverdue ? 'text-amber-900 font-semibold' : 'text-gray-400'}`}
                        title={isOverdue ? 'Past due' : 'Due date'}
                      >
                        {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <button
                      onClick={() => onOpenTask?.(task.board_id, task.id)}
                      className="shrink-0 flex items-center gap-0.5 text-sm font-semibold text-brand-gold-dark hover:underline"
                    >
                      View <ArrowRight size={13} />
                    </button>
                  </div>
                  <div
                    key={`${task.id}-gap`}
                    className="h-[46px]"
                    style={{ borderBottom: `1px solid ${i % 2 === 0 ? 'rgba(236,72,153,0.45)' : 'rgba(59,130,246,0.45)'}` }}
                  />
                  </Fragment>
                  )
                })}
                {/* Filler ruled lines, absolutely positioned so they paint the rest
                    of the page without adding height — otherwise the paper would grow
                    past the sticky-note column it's meant to line up with. Rows are
                    h-9 (36px), so the layer starts below however many tasks rendered.
                    Surplus lines clip against the paper's overflow-hidden. */}
                <div
                  className="absolute inset-x-0 bottom-0 overflow-hidden pointer-events-none"
                  style={{ top: `${(myTasks.length === 0 ? 1 : myTasks.length * 2) * 46}px` }}
                >
                  {Array.from({ length: Math.max(0, 7 - (myTasks.length === 0 ? 1 : myTasks.length * 2)) }).map((_, i) => {
                    const idx = myTasks.length + i + (myTasks.length === 0 ? 1 : 0)
                    return (
                      <div key={`filler-${i}`} className="h-[46px] border-b border-gray-100" />
                    )
                  })}
                </div>
              </div>
            </section>

          {/* RIGHT column — the goals note. Wider than the countdowns were,
              since these are sentences rather than a number. Absent entirely
              on a team with its own goals, so My Tasks gets the room. */}
          {showGoals && (
          <div className="w-full md:w-[21rem] flex flex-col gap-5 shrink-0">

            {/* The season's goals, in place of the three countdowns. They are
                what the team is actually measured against, so they earn the
                space more than a ticking clock does. */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0 max-h-[442px]">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
                <Target size={18} className="text-brand-silver-dark" />
                <h2 className="font-semibold text-gray-700">Our Goals</h2>
              </div>
              <ol className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-2.5">
                {SEASON_GOALS.map((g, i) => (
                  <li key={g.id} className="flex gap-2">
                    <span
                      className="shrink-0 w-5 h-5 rounded-full bg-brand-gold text-gray-700 text-[11px] font-bold flex items-center justify-center mt-0.5"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700">{g.label}</p>
                      <p className="text-[11px] text-gray-600 leading-snug mt-0.5">{markMeasures(g.text)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          )}
        </div>

        {/* Season Timeline (top of the Home Page) */}

        {/* Comp Day Banner */}
        {compDayActive && (
          <button
            onClick={() => onTabChange('comp-day')}
            className="w-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 text-white rounded-xl p-4 shadow-lg hover:shadow-xl transition-shadow text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold flex items-center gap-2">
                  <span className="animate-pulse">🏁</span> Competition Day is LIVE
                </p>
                <p className="text-white/80 text-sm">Tap to see your role assignment</p>
              </div>
              <ArrowRight size={20} />
            </div>
          </button>
        )}

        {/* Comp Day Role Preview */}
        {!compDayActive && compDayPreview && !isGuest && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Comp Day Roles</h3>
              <span className="text-xs text-gray-400">{compDayPreview.sessionName}</span>
            </div>
            <div className="space-y-1.5">
              {compDayPreview.roles.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-sm text-gray-600">{r.blockName}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-gold/30 text-gray-700">
                    {r.emoji} {r.label}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => onTabChange('comp-day')}
              className="w-full mt-3 py-2 rounded-lg bg-brand-silver/50 hover:bg-brand-silver text-gray-700 text-sm font-medium transition-colors"
            >
              View Competition Day
            </button>
          </div>
        )}

        {/* Engineering Notebook photo gallery */}
        <NotebookGallery onTabChange={onTabChange} />

        {/* 4. Random Quote Footer — and the way in to adding one. The quote is
            what you are looking at when you think of one, so it is a better
            door than a tile at the top that said the same thing. */}
        {!isGuest && (
          <div className="text-center py-3">
            <button
              onClick={() => onOpenSpecial?.('quotes')}
              title="Add a quote"
              className="group inline-block max-w-xl px-4 py-1 rounded-lg hover:bg-brand-silver/15 transition-colors"
            >
              {quote ? (
                <p className="text-sm italic text-gray-400 group-hover:text-gray-600">
                  "{quote.content}"
                  {quote.submitted_by && <span className="not-italic"> — {quote.submitted_by}</span>}
                </p>
              ) : (
                <p className="text-sm italic text-gray-400 group-hover:text-gray-600">
                  No fun quotes yet — submit one!
                </p>
              )}
              <span className="block text-[10px] text-gray-300 group-hover:text-brand-silver-dark transition-colors">
                + add a quote
              </span>
            </button>
          </div>
        )}
      </main>

      {/* Photo lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={(e) => e.stopPropagation()}>
            {/* Left arrow */}
            {photos.length > 1 && (
              <button
                onClick={() => {
                  const prev = (photoIndex - 1 + photos.length) % photos.length
                  setPhotoIndex(prev)
                  setSelectedPhoto(photos[prev])
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              >
                <ChevronLeft size={24} className="text-white" />
              </button>
            )}

            {/* Right arrow */}
            {photos.length > 1 && (
              <button
                onClick={() => {
                  const next = (photoIndex + 1) % photos.length
                  setPhotoIndex(next)
                  setSelectedPhoto(photos[next])
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              >
                <ChevronRight size={24} className="text-white" />
              </button>
            )}

            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.caption || 'Season photo'}
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-sm text-white/70">
                {selectedPhoto.uploaded_by && `Uploaded by ${selectedPhoto.uploaded_by}`}
                {photos.length > 1 && <span className="ml-2">{photoIndex + 1} / {photos.length}</span>}
              </p>
              <div className="flex gap-2">
                {(hasLeadTag || selectedPhoto.uploaded_by === username) && (
                  <button
                    onClick={() => handleDeletePhoto(selectedPhoto)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm text-white transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeView
