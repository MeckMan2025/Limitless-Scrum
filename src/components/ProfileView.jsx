import { useState, useEffect, useRef } from 'react'
import { restHeaders, ensureUserToken } from '../lib/restHeaders'
import { notifyLeadOfCoLeadAction } from '../lib/coLeadNotice'
import { fetchMyTasks } from '../lib/taskTeams'
import { User, ChevronDown, AlertTriangle, CheckCircle, Clock, Lock, XCircle, Wrench, Shield, MessageCircle, Camera } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePresenceContext } from '../contexts/PresenceContext'
import OnlineDot from './OnlineDot'
import { usePermissions } from '../hooks/usePermissions'
import { teamScope } from '../lib/teamScope'
import NotificationBell from './NotificationBell'
import NotebookBook from './NotebookBook'
import { getSideStyle, getSideLabel, getSides, SIDE_HEX, SIDE_LABEL } from '../utils/sideColors'
import { triggerPush } from '../utils/pushHelper'
import { presencePct } from '../lib/attendanceTiming'

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  { value: 'locked-in', label: 'Locked In', icon: Lock, color: 'text-yellow-600', bg: 'bg-yellow-50', note: 'Focused work, minimal interruptions' },
  { value: 'dnd', label: "Don't Talk To Me", icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', note: 'No interruptions unless critical' },
  { value: 'in-lab', label: 'In Lab', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
  { value: 'out', label: 'Out', icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50' },
]

const DISCIPLINE_OPTIONS = [
  'Mechanical', 'Electrical', 'Programming', 'CAD', 'Autonomy',
  'Design', 'Testing', 'Business', 'Strategy',
]


const ROLE_OPTIONS = [
  'Co-Founder', 'Mentor', 'Coach', 'Project Manager', 'Business Lead', 'Technical Lead', 'Programming Lead',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead',
  'Communications', 'Finance', 'Outreach',
  'CAD', 'Assembly/Building', 'Wiring', 'Programming', 'Scouting', 'Guest',
]

const DEFAULT_PROFILE_DATA = {
  discipline: '',
  timezone: '',
  status: 'available',
  sprint_capacity: 0,
  systems_owned: [],
  review_responsibilities: [],
  skills: {},
  tools: [],
  safety_certs: [],
  permissions: [],
  comm_style: '',
  comm_notes: '',
  avatar_url: '',
}

// Small presence-% sparkline for a profile.
function MiniTrend({ points }) {
  const pts = (points || []).slice(-12)
  if (pts.length < 2) return null
  const W = 300, H = 70, pad = 6
  const x = i => pad + (i * (W - pad * 2)) / (pts.length - 1)
  const y = v => pad + (H - pad * 2) - (Math.max(0, Math.min(100, v)) / 100) * (H - pad * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 80 }} preserveAspectRatio="none">
      <path d={`${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`} fill="#6366f1" opacity="0.08" />
      <path d={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.pct)} r="2.6" fill="#6366f1" />)}
    </svg>
  )
}

function ProfileView({ viewingProfileId, onClearViewing }) {
  const { username, nickname: savedNickname, useNickname: savedUseNickname, user, authorityTier, primaryRoleLabel, functionTags, shortBio, isTeam, teamNumber } = useUser()
  const { isOnline } = usePresenceContext()
  const effectiveIsTeam = isTeam || !!(user?.email && /^team\d+@teams\.radical$/.test(user.email.toLowerCase())) || (functionTags && functionTags.includes('Team'))
  const { role, secondaryRoles, isElevated, tier, isAuthorityAdmin, canChangeRoles, myTeamNumber } = usePermissions()
  // One rule for whose rows these are — see lib/teamScope.js.
  const SCOPE = teamScope(myTeamNumber)
  const isViewingOther = viewingProfileId && viewingProfileId !== user?.id
  const [viewedProfile, setViewedProfile] = useState(null)
  const [viewedLoading, setViewedLoading] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editUseNickname, setEditUseNickname] = useState(false)
  const [profile, setProfile] = useState(DEFAULT_PROFILE_DATA)
  const [saving, setSaving] = useState(false)
  // Auto-save can't run until the profile has actually loaded, or the empty
  // initial state would overwrite real data.
  const loadedRef = useRef(false)
  // The display_name currently stored in the DB. Attendance rows are keyed by
  // name, so a rename has to carry them along or the person shows up twice on
  // every past meeting: once under the old name, once as a blank "no record".
  const savedNameRef = useRef(null)
  const saveTimer = useRef(null)
  const [saved, setSaved] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [taskStats, setTaskStats] = useState({ active: 0, blocked: 0, total: 0 })
  const [assignedTasks, setAssignedTasks] = useState([])
  // What someone else's profile shows about them — loaded only when actually
  // looking at someone else.
  const [otherWork, setOtherWork] = useState({ sessions: [], records: [], tasks: [], entries: [], loading: true })

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // An id of the form "invite:<whitelistId>" is an approved email that has no
  // account yet. It gets the same profile page, shaped from the whitelist row,
  // so roles can be assigned before the person ever signs up.
  const inviteId = String(viewingProfileId || '').startsWith('invite:')
    ? String(viewingProfileId).slice('invite:'.length)
    : null

  // Load viewed profile when viewing someone else
  useEffect(() => {
    if (!isViewingOther) { setViewedProfile(null); return }
    setViewedLoading(true)
    const headers = restHeaders()
    const url = inviteId
      ? `${supabaseUrl}/rest/v1/approved_emails?${SCOPE}&id=eq.${inviteId}&select=*`
      : `${supabaseUrl}/rest/v1/profiles?id=eq.${viewingProfileId}&select=*`
    fetch(url, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(rows => {
        const row = rows[0]
        if (!row) return
        if (!inviteId) { setViewedProfile(row); return }
        // Shape the whitelist row like a profile so the page renders as usual.
        const local = String(row.email || '').split('@')[0].replace(/[._0-9]+/g, ' ').trim()
        setViewedProfile({
          id: viewingProfileId,
          __invite: row,
          display_name: local ? local.charAt(0).toUpperCase() + local.slice(1) : row.email,
          function_tags: String(row.role || '').split(',').map(r => r.trim()).filter(r => r && r.toLowerCase() !== 'member'),
          status: '',
          avatar_url: '',
        })
      })
      .catch(() => {})
      .finally(() => setViewedLoading(false))
  }, [viewingProfileId])

  const [roleSaving, setRoleSaving] = useState('')

  // Read the auth token synchronously from localStorage (avoids getSession hangs)
  // so RLS is satisfied when an admin edits another member's roles.
  const getAuthHeaders = () => {
    try {
      const ref = supabaseUrl.split('//')[1].split('.')[0]
      const raw = window.localStorage.getItem(`sb-${ref}-auth-token`)
      if (raw) {
        const parsed = JSON.parse(raw)
        const token = parsed?.access_token
        const expMs = (parsed?.expires_at || 0) * 1000
        // Only use the token while it's actually valid — sending an expired one
        // gets the write rejected outright ("Failed to save role: JWT expired"),
        // which is worse than the anon fallback that RLS accepts.
        if (token && Date.now() < expMs - 10000) {
          return { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
        }
      }
    } catch { /* fall through */ }
    return restHeaders()
  }

  // Admin: toggle a role on the profile currently being viewed.
  const toggleViewedRole = async (roleName) => {
    if (!viewedProfile) return
    const current = viewedProfile.function_tags || []

    // No account yet: roles live on the whitelist row and are copied onto the
    // profile the moment they sign up.
    if (viewedProfile.__invite) {
      const next = current.includes(roleName)
        ? current.filter(r => r !== roleName)
        : [...current, roleName]
      setViewedProfile(prev => ({ ...prev, function_tags: next }))
      setRoleSaving(roleName)
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/approved_emails?id=eq.${viewedProfile.__invite.id}`, {
          method: 'PATCH',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ role: next.join(',') || 'member' }),
        })
        if (!res.ok) throw new Error(await res.text() || res.statusText)
      } catch (err) {
        setViewedProfile(prev => ({ ...prev, function_tags: current }))
        alert('Failed to save role: ' + err.message)
      } finally {
        setRoleSaving('')
      }
      return
    }

    const wasAdded = !current.includes(roleName)
    let updated
    if (roleName === 'Guest') {
      updated = wasAdded ? ['Guest'] : []
    } else {
      updated = wasAdded ? [...current.filter(r => r !== 'Guest'), roleName] : current.filter(r => r !== roleName)
    }
    const newTier = updated.length === 0 || (updated.length === 1 && updated[0] === 'Guest') ? 'guest' : 'teammate'
    // Optimistic update
    setViewedProfile(prev => ({ ...prev, function_tags: updated, authority_tier: newTier }))
    setRoleSaving(roleName)
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${viewingProfileId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ function_tags: updated, authority_tier: newTier }),
      })
      if (!res.ok) throw new Error(await res.text() || res.statusText)
      const rows = await res.json()
      if (!rows || rows.length === 0) throw new Error('Update did not affect any rows')
      // Changing someone's roles is lead business; if a co-lead did it, the
      // lead they share the job with hears about it.
      notifyLeadOfCoLeadAction({
        actor: username, tags: functionTags, type: 'role_request',
        detail: `${wasAdded ? 'gave' : 'removed'} ${roleName}${viewedProfile?.display_name ? ` \u2014 ${viewedProfile.display_name}` : ''}`,
      })
      // Notify the member their role changed (mirrors User Management)
      const notif = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        user_id: viewingProfileId,
        type: 'role_change',
        title: wasAdded ? 'New Role Assigned!' : 'Role Removed',
        body: wasAdded
          ? `You're now a ${roleName}!`
          : `You're no longer a ${roleName}.`,
        data: JSON.stringify({ role: roleName, action: wasAdded ? 'added' : 'removed' }),
      }
      fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(notif),
      }).catch(() => {})
      triggerPush(notif)
    } catch (err) {
      // Rollback
      setViewedProfile(prev => ({ ...prev, function_tags: current }))
      alert('Failed to save role: ' + err.message)
    } finally {
      setRoleSaving('')
    }
  }

  // Load profile data via direct fetch
  useEffect(() => {
    async function load() {
      if (!user) return
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=*`, {
          headers: restHeaders(),
        })
        if (!res.ok) return
        const rows = await res.json()
        const data = rows[0]
        if (!data) return
        setEditName(data.display_name || '')
        savedNameRef.current = data.display_name || ''
        setEditNickname(data.nickname || '')
        setEditUseNickname(!!data.use_nickname)
        setTimeout(() => { loadedRef.current = true }, 0)
        setProfile(prev => ({
          ...prev,
          discipline: data.discipline || '',
          timezone: data.timezone || '',
          status: data.status || 'available',
          sprint_capacity: data.sprint_capacity || 0,
          systems_owned: data.systems_owned || [],
          review_responsibilities: data.review_responsibilities || [],
          skills: data.skills || {},
          tools: data.tools || [],
          safety_certs: data.safety_certs || [],
          permissions: data.permissions || [],
          comm_style: data.comm_style || '',
          comm_notes: data.comm_notes || '',
          avatar_url: data.avatar_url || '',
        }))
      } catch (err) {
        console.error('Failed to load profile:', err)
      }
    }
    load()
  }, [user])

  // Load task stats via direct fetch
  useEffect(() => {
    async function loadTasks() {
      if (!username) return
      try {
        const res = await fetchMyTasks(
          supabaseUrl,
          restHeaders(),
          username,
          functionTags,
        )
        if (!res.ok) return
        const data = await res.json()
        setAssignedTasks(data)
        setTaskStats({
          active: data.filter(t => t.status !== 'done').length,
          blocked: data.filter(t => t.status === 'todo').length,
          total: data.length,
        })
      } catch (err) {
        console.error('Failed to load tasks:', err)
      }
    }
    loadTasks()
  }, [username])

  const [saveError, setSaveError] = useState('')

  const patchField = async (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }))
    if (!user?.id) return
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ [field]: value }),
      })
      const rows = res.ok ? await res.json() : null
      if (!rows || rows.length === 0) throw new Error('not saved')
    } catch {
      setSaveError('Could not save that change.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  // Everything saves itself shortly after you stop typing; there is no Save
  // button, just a small status word in the header.
  useEffect(() => {
    if (!loadedRef.current || isViewingOther) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { handleSave() }, 900)
    return () => clearTimeout(saveTimer.current)
  }, [profile, editName, editNickname, editUseNickname]) // eslint-disable-line

  const viewedName = viewedProfile?.display_name || ''
  // Whoever this page is about — them, or you. The same work is loaded either
  // way, so your own profile isn't the one place that can't show your tasks.
  const shownName = isViewingOther ? viewedName : (profile?.display_name || username || '')
  useEffect(() => {
    if (!shownName) { setOtherWork({ sessions: [], records: [], tasks: [], entries: [], loading: false }); return }
    let active = true
    const name = encodeURIComponent(shownName)
    setOtherWork(w => ({ ...w, loading: true }))
    // A real token first, or a phone that was asleep loads an empty page.
    ensureUserToken().then(() => {
      const h = restHeaders()
      return Promise.all([
        fetch(`${supabaseUrl}/rest/v1/attendance_sessions?${SCOPE}&select=id,session_date,duration_min&order=session_date.desc`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${supabaseUrl}/rest/v1/attendance_records?${SCOPE}&username=eq.${name}&select=session_id,status,reason,late_min,early_min,late_excused,early_excused`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${supabaseUrl}/rest/v1/tasks?assignee=ilike.${name}&select=*`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${supabaseUrl}/rest/v1/notebook_entries?${SCOPE}&username=eq.${name}&select=*&order=meeting_date.desc`, { headers: h }).then(r => r.ok ? r.json() : []),
      ])
    }).then(([sessions, records, tasks, entries]) => {
      if (active) setOtherWork({ sessions, records, tasks, entries, loading: false })
    }).catch(() => { if (active) setOtherWork(w => ({ ...w, loading: false })) })
    return () => { active = false }
  }, [shownName]) // eslint-disable-line

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaveError('')

    const baseFields = {
      display_name: editName.trim() || username,
      discipline: profile.discipline,
      timezone: profile.timezone,
      status: profile.status,
      sprint_capacity: profile.sprint_capacity,
      systems_owned: profile.systems_owned,
      review_responsibilities: profile.review_responsibilities,
      skills: profile.skills,
      tools: profile.tools,
      safety_certs: profile.safety_certs,
      permissions: profile.permissions,
      comm_style: profile.comm_style,
      comm_notes: profile.comm_notes,
      avatar_url: profile.avatar_url,
      notification_prefs: profile.notification_prefs,
      music_preference: profile.music_preference,
    }

    const nicknameFields = {
      nickname: editNickname.trim(),
      use_nickname: editUseNickname,
    }

    try {
      // Try saving everything including nickname fields
      let res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ ...baseFields, ...nicknameFields }),
      })

      // If it failed (likely missing nickname columns), retry without nickname fields
      if (!res.ok) {
        console.warn('Full save failed, retrying without nickname fields...')
        res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: {
            ...restHeaders(),
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(baseFields),
        })
        if (res.ok) {
          setSaveError('Name saved! To save nicknames, run the SQL to add nickname columns.')
          setTimeout(() => setSaveError(''), 5000)
        }
      }

      // A PATCH that matched nothing still returns 2xx; treat an empty body as
      // a failure so a silent no-op can't masquerade as a save.
      if (res.ok) {
        const rows = await res.clone().json().catch(() => null)
        if (Array.isArray(rows) && rows.length === 0) {
          setSaveError("Couldn't save — your profile row wasn't found.")
          setTimeout(() => setSaveError(''), 5000)
          setSaving(false)
          return
        }
      }

      if (res.ok) {
        const newName = editName.trim() || username
        savedNameRef.current = newName
        // Rows record their author by name. The database moves them all to
        // the new name in the same save (profiles_name_cascade in
        // supabase/security_person_rules.sql), attendance included.
        localStorage.setItem('scrum-username', newName)
        localStorage.setItem('scrum-nickname', editNickname.trim())
        localStorage.setItem('scrum-use-nickname', String(editUseNickname))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const errText = await res.text()
        console.error('Save failed:', errText)
        setSaveError('Save failed — check console for details')
        setTimeout(() => setSaveError(''), 5000)
      }
    } catch (err) {
      console.error('Failed to save profile:', err)
      setSaveError('Save failed — network error')
      setTimeout(() => setSaveError(''), 5000)
    }
    setSaving(false)
  }

  const handleStatusChange = async (newStatus) => {
    setProfile(prev => ({ ...prev, status: newStatus }))
    setStatusOpen(false)
    if (user) {
      fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: newStatus }),
      }).catch(err => console.error('Failed to update status:', err))
    }
  }

  const toggleArrayItem = (field, item) => {
    setProfile(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item],
    }))
  }

  const avatarInputRef = useRef(null)

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Photo must be under 10 MB'); return }
    const img = new Image()
    const reader = new FileReader()
    reader.onload = (ev) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 256
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else { w = Math.round(w * MAX / h); h = MAX }
        }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5)
        setProfile(prev => ({ ...prev, avatar_url: dataUrl }))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === profile.status) || STATUS_OPTIONS[0]
  const CurrentStatusIcon = currentStatus.icon

  const usagePercent = profile.sprint_capacity > 0
    ? Math.min(100, Math.round((taskStats.active / profile.sprint_capacity) * 100))
    : 0

  // ── Read-only view for viewing someone else's profile ──
  // Attendance, current tasks and notebook entries for whoever is being shown.
  // Your own profile shows exactly what everyone else's does — there is no
  // reason it should be the one page that tells you less about you.
  const renderWork = (work) => {
    const { sessions, records, entries, tasks, loading } = work
              if (loading) return <p className="text-sm text-gray-400 text-center py-4">Loading their work…</p>
              const byId = Object.fromEntries(records.map(r => [r.session_id, r.status]))
              // The whole record, so a missed meeting can say why. This is
              // where someone's absences are read end to end, which is the
              // place the reason is actually worth having.
              const recById = Object.fromEntries(records.map(r => [r.session_id, r]))
              // Only meetings they were actually marked at. "No record" means
              // never marked either way, so it isn't a zero against them.
              const counted = sessions.filter(sn => byId[sn.id])
              const pts = [...counted].reverse().map(sn => ({
                date: sn.session_date,
                pct: presencePct(recById[sn.id], sn),
              }))
              const rate = pts.length ? Math.round(pts.reduce((a, b) => a + b.pct, 0) / pts.length) : 0
              const present = records.filter(r => r.status === 'present').length
              const openTasks = tasks.filter(t => t.status !== 'done')
              return (
                <>
                  <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
                    <h3 className="font-semibold text-gray-700">Attendance</h3>
                    {sessions.length === 0 ? (
                      <p className="text-sm text-gray-400">No meetings recorded yet.</p>
                    ) : (
                      <>
                        <div className="flex items-end gap-4">
                          <div className="text-3xl font-bold text-gray-800">{rate}%</div>
                          <div className="text-xs text-gray-400 pb-1">{present} present / {counted.length} meetings</div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full transition-all duration-500" style={{
                            width: `${rate}%`,
                            background: rate >= 80 ? '#86efac' : rate >= 50 ? '#fde68a' : '#fca5a5',
                          }} />
                        </div>
                        <MiniTrend points={pts} />
                        <div className="space-y-1.5 pt-1">
                          {counted.map(sn => {
                            const st = byId[sn.id]
                            const cls = st === 'present' ? 'bg-green-100 text-green-700'
                              : st === 'absent' ? 'bg-red-100 text-red-700'
                              : st === 'excused' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'
                            const why = recById[sn.id]?.reason
                            return (
                              <div key={sn.id} className="flex items-start justify-between gap-2 text-sm">
                                <div className="min-w-0">
                                  <span className="text-gray-600">
                                    {new Date(sn.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </span>
                                  {st !== 'present' && why && (
                                    <p className="text-[11px] text-gray-500 italic truncate" title={why}>“{why}”</p>
                                  )}
                                </div>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${cls}`}>{st}</span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </section>

                  {/* ─── Current tasks ─── */}
                  <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2">
                    <h3 className="font-semibold text-gray-700">
                      Current tasks <span className="text-sm font-normal text-gray-400">({openTasks.length})</span>
                    </h3>
                    {openTasks.length === 0 ? (
                      <p className="text-sm text-gray-400">Nothing assigned right now.</p>
                    ) : openTasks.map(t => (
                      <div key={t.id} className="border border-gray-100 rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">{t.title || t.name || 'Untitled'}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-blue/30 text-gray-600 shrink-0">{t.status}</span>
                        </div>
                        {t.due_date && <p className="text-xs text-gray-400 mt-0.5">Due {t.due_date}</p>}
                      </div>
                    ))}
                  </section>

                  {/* ─── Notebook ─── */}
                  {/* Read as the notebook it is, rather than as a stack of
                      cards: contents of dates, a page each, turned from the
                      corner. Same as the notebook tab, so a profile and the
                      notebook don't show the same entries two different ways. */}
                  <section className="space-y-2">
                    <h3 className="font-semibold text-gray-700">
                      Engineering notebook <span className="text-sm font-normal text-gray-400">({entries.length})</span>
                    </h3>
                    <NotebookBook entries={entries} projectName={`${shownName}'s notebook`} />
                  </section>
                </>
              )
  }

  if (isViewingOther) {
    const vp = viewedProfile
    if (viewedLoading || !vp) {
      return (
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
            <div className="py-4 px-4 flex items-center justify-between text-gray-200">
              <button onClick={onClearViewing} className="ml-14 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-800 rounded-lg transition-colors">&larr; Back</button>
              <div className="flex-1 text-center">
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">Profile</h1>
              </div>
              <NotificationBell />
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 animate-pulse">Loading profile...</p>
          </div>
        </div>
      )
    }

    const vpStatus = STATUS_OPTIONS.find(s => s.value === vp.status) || STATUS_OPTIONS[0]
    const VpStatusIcon = vpStatus.icon
    const vpTags = vp.function_tags || []
    // Someone who hasn't signed up yet carries their address on the whitelist
    // row; everyone else gets it from profiles.email, which a trigger on
    // auth.users keeps in step.
    const vpEmail = vp.__invite?.email || vp.email || ''

    return (
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
          <div className="py-4 px-4 flex items-center justify-between text-gray-200">
            <button onClick={onClearViewing} className="ml-14 md:ml-0 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-800 rounded-lg transition-colors">&larr; Back</button>
            <div className="flex-1 text-center">
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
                {vp.display_name || 'Profile'}
              </h1>
            </div>
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Identity */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start gap-4">
                {/* Avatar wrapped in a tie-dye ring showing the member's side(s) */}
                <div className="shrink-0 rounded-full p-[3px] relative" style={getSideStyle(vpTags)}>
                  {vp.avatar_url ? (
                    <img src={vp.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover ring-2 ring-white" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-blue to-brand-yellow flex items-center justify-center ring-2 ring-white">
                      <span className="text-2xl font-bold text-white">{(vp.display_name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <span className="absolute bottom-0.5 right-0.5">
                    <OnlineDot online={isOnline(vp.display_name)} size={15} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-800">{vp.display_name || 'Unknown'}</h2>
                  {vp.primary_role_label && <p className="text-sm text-gray-600 font-medium">{vp.primary_role_label}</p>}
                  {vpEmail && (
                    <a
                      href={`mailto:${vpEmail}`}
                      className="block text-sm text-gray-500 hover:text-brand-blue-dark hover:underline break-all"
                    >
                      {vpEmail}
                    </a>
                  )}
                  {/* Side badge(s) */}
                  {getSides(vpTags).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {getSides(vpTags).map(side => (
                        <span
                          key={side}
                          className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
                          style={{ backgroundColor: SIDE_HEX[side] }}
                        >
                          {SIDE_LABEL[side]}
                        </span>
                      ))}
                    </div>
                  )}
                  {vpTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {vpTags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full font-medium bg-brand-yellow/30 text-brand-yellow-dark">{tag}</span>
                      ))}
                    </div>
                  )}
                  {vp.short_bio && <p className="text-sm text-gray-500 mt-2 italic">{vp.short_bio}</p>}
                </div>
              </div>

              {/* Status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mt-4 ${vpStatus.bg}`}>
                <VpStatusIcon size={16} className={vpStatus.color} />
                <span className="text-sm font-medium text-gray-700">{vpStatus.label}</span>
              </div>

              {vp.discipline && (
                <div className="mt-3">
                  <span className="text-sm px-2.5 py-1 rounded-full bg-brand-blue/30 text-brand-blue-dark font-medium">{vp.discipline}</span>
                </div>
              )}
            </section>

            {/* Admin role editor — the ONLY place a member's roles are changed */}
            {canChangeRoles && (
              <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-700 mb-1">Roles</h3>
                <p className="text-xs text-gray-400 mb-3">Add a role from the dropdown, or remove one below. This sets their side colors and access.</p>

                {/* Assigned roles as removable chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(vpTags || []).length === 0 ? (
                    <span className="text-xs text-gray-400">No roles assigned</span>
                  ) : (
                    (vpTags || []).map(r => (
                      <span key={r} className="text-xs px-2.5 py-1 rounded-full font-medium bg-brand-yellow text-gray-800 inline-flex items-center gap-1">
                        {r}
                        <button
                          type="button"
                          disabled={roleSaving === r}
                          onClick={() => toggleViewedRole(r)}
                          className="hover:opacity-70 transition-opacity disabled:opacity-50"
                          title={`Remove ${r}`}
                        >
                          <XCircle size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Dropdown to add a role */}
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) toggleViewedRole(e.target.value) }}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
                >
                  <option value="">+ Add a role…</option>
                  {ROLE_OPTIONS.filter(r => !(vpTags || []).includes(r)).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </section>
            )}

            {renderWork(otherWork)}

          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="py-4 px-4 flex items-center justify-between text-gray-200">
          <div className="w-10 shrink-0 text-gray-200" />
          <div className="flex-1 text-center">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              My Profile
            </h1>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            <NotificationBell />
            {/* Nothing here — edits just save. Only real failures speak up
                (saveError, rendered below). */}
          </div>
        </div>
        {saveError && (
          <p className="text-xs text-amber-600 text-center pb-2 px-4">{saveError}</p>
        )}
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* ─── Header / Identity ─── */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-blue to-brand-yellow flex items-center justify-center">
                    <User size={32} className="text-white" />
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={20} className="text-white" />
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="space-y-2 mb-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Nickname</label>
                    <input
                      type="text"
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      placeholder="Optional nickname"
                      className="w-full px-3 py-1.5 border rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Display as</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditUseNickname(false)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          !editUseNickname ? 'bg-brand-yellow font-medium text-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {editName || username || 'Name'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUseNickname(true)}
                        disabled={!editNickname.trim()}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40 ${
                          editUseNickname ? 'bg-brand-yellow font-medium text-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {editNickname.trim() || 'Nickname'}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500">{user?.email}</p>
                {primaryRoleLabel && (
                  <p className="text-sm text-gray-600 font-medium mt-0.5">{primaryRoleLabel}</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {functionTags.length > 0 && functionTags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full font-medium bg-brand-yellow/30 text-brand-yellow-dark">
                      {tag}
                    </span>
                  ))}
                  {profile.discipline && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/30 text-brand-blue-dark font-medium">
                      {profile.discipline}
                    </span>
                  )}
                </div>
                {shortBio && (
                  <p className="text-sm text-gray-500 mt-2 italic">{shortBio}</p>
                )}
              </div>
            </div>

            {/* Status selector */}
            {!effectiveIsTeam && <div className="mt-4 relative">
              <button
                onClick={() => setStatusOpen(!statusOpen)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-colors ${currentStatus.bg} border-current/10`}
              >
                <div className="flex items-center gap-2">
                  <CurrentStatusIcon size={18} className={currentStatus.color} />
                  <span className="font-medium text-gray-700">{currentStatus.label}</span>
                  {currentStatus.note && (
                    <span className="text-xs text-gray-400 hidden sm:inline">— {currentStatus.note}</span>
                  )}
                </div>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${statusOpen ? 'rotate-180' : ''}`} />
              </button>
              {statusOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-20">
                  {STATUS_OPTIONS.map(opt => {
                    const OptIcon = opt.icon
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleStatusChange(opt.value)}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                          opt.value === profile.status ? 'bg-gray-50' : ''
                        }`}
                      >
                        <OptIcon size={18} className={opt.color} />
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-700">{opt.label}</p>
                          {opt.note && <p className="text-xs text-gray-400">{opt.note}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>}

            {/* Discipline & Timezone */}
            {!effectiveIsTeam && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Discipline</label>
                <select
                  value={profile.discipline}
                  onChange={(e) => patchField('discipline', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                >
                  <option value="">Select...</option>
                  {DISCIPLINE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Timezone</label>
                <input
                  type="text"
                  value={profile.timezone}
                  onChange={(e) => patchField('timezone', e.target.value)}
                  placeholder="e.g. CST"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                />
              </div>
            </div>
            )}
          </section>

          {/* The same attendance, tasks and notebook summary anyone else's
              profile shows — about you. */}
          {renderWork(otherWork)}

        </div>
      </main>
    </div>
  )
}

export default ProfileView
