import { useState, useEffect } from 'react'
import { onlyMyTeam, stampStored, teamScope } from '../lib/teamScope'
import { restHeaders, AUTH_STORAGE_KEY } from '../lib/restHeaders'
import { notifyRequestReviewers } from '../utils/requestRouting'
import { Pencil, UserPlus, Trash2, Upload, Shield, Users, KeyRound, Info, X, Plus, Send, ChevronRight, GraduationCap } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import PasswordInput from './PasswordInput'
import { usePermissions } from '../hooks/usePermissions'
import { HOME_TEAM_NUMBER, isHomeTeamNumber, teamAuthEmail } from '../data/team'
import NotificationBell from './NotificationBell'
import { triggerPush } from '../utils/pushHelper'
import { getSideStyle } from '../utils/sideColors'
import { ROLE_GUIDE } from '../data/roleGuide'

const ALL_ROLES = [
  'Co-Founder', 'Mentor', 'Coach', 'Project Manager', 'Business Lead', 'Technical Lead', 'Programming Lead',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead',
  'Communications', 'Finance', 'Outreach',
  'CAD', 'Assembly/Building', 'Wiring', 'Programming', 'Scouting', 'Guest',
]

// Roles grouped by department (mirrors the Org Chart) for the role pickers.
const ROLE_GROUPS = [
  { label: 'Leadership', roles: ['Co-Founder', 'Mentor', 'Coach', 'Project Manager', 'Business Lead', 'Technical Lead', 'Programming Lead'] },
  { label: 'Co-Leads', roles: ['Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead'] },
  { label: 'Business', roles: ['Communications', 'Finance', 'Outreach'] },
  { label: 'Technical · Hardware', roles: ['CAD', 'Assembly/Building', 'Wiring'] },
  { label: 'Technical · Software', roles: ['Programming', 'Scouting'] },
  { label: 'Access', roles: ['Guest'] },
]

const PERMANENT_COFOUNDER_NAMES = ['yukti', 'kayden']

// Permanent accounts that NO ONE can delete (protected in the UI + delete guard).
// everythingthatsscrum@gmail.com is the team's permanent Co-Founder account ("ETS").
const PROTECTED_MEMBER_IDS = ['0c5bee06-ac67-42a0-a43b-50be4b20d984']
const PROTECTED_MEMBER_NAMES = ['ets', 'everythingthatsscrum']
const isPermanentMember = (m) => !!m && (
  PROTECTED_MEMBER_IDS.includes(m.id) ||
  PROTECTED_MEMBER_NAMES.includes((m.display_name || '').trim().toLowerCase())
)

const LEAGUES = [
  'Machu Picchu League',
  'Acropolis League',
  'Giza League',
  'Pompeii League',
  'Stonehenge League',
  'Western Iowa League',
  'Easter Island League',
  'Chichen Itza League',
]

const ROLE_DESCRIPTIONS = {
  'Co-Founder': 'Team co-founder with full administrative access',
  'Mentor': 'Adult mentor providing guidance and oversight',
  'Coach': 'Team coach supervising strategy and development',
  'Project Manager': 'Coordinates timelines, tasks, and all sub-teams',
  'Business Lead': 'Leads business plan, outreach, and fundraising',
  'Technical Lead': 'Leads robot design, build, and programming',
  'Programming Lead': 'Leads the software subteam and its members',
  'Co-Project Manager': 'Shares the Project Manager job',
  'Co-Business Lead': 'Shares the Business Lead job',
  'Co-Technical Lead': 'Shares the Hardware lead job',
  'Co-Programming Lead': 'Shares the Software lead job',
  'Communications': 'Team communications, the team website, and social media',
  'Finance': 'Manages the budget, fundraising, and reimbursements',
  'Outreach': 'Runs community events and STEM outreach',
  'CAD': 'Creates 3D models and technical drawings',
  'Assembly/Building': 'Builds and assembles the physical robot',
  'Wiring': 'Wires motors, sensors, and manages the electronics',
  'Programming': 'Writes and maintains robot control software',
  'Scouting': 'Collects and analyzes match data at competitions',
  'Guest': 'Limited access — can view boards, tasks, and calendar only',
}


// Approved-email display names.
//
// approved_emails has no name column, so names come from here: an explicit map
// for people we know, and a fallback that unpacks "lastfirst@school" into
// "First Last". Replace this with a real column if one is ever added.
const INVITE_NAMES = {
  'langlily@pleasval.org': 'Lily Lang',
  'dinakaransahana@pleasval.org': 'Sahana Dinakaran',
  'tummalapalliamruta@pleasval.org': 'Amruta Tummalapalli',
  'jaiganeshaakansha@pleasval.org': 'Aakansha Jaiganesh',
  'kulkarnisaumyaa@pleasval.org': 'Saumyaa Kulkarni',
  'pallamreddysuhaas@pleasval.org': 'Suhaas Pallamreddy',
  'kathiravanprakruthi@pleasval.org': 'Prakruthi Kathiravan',
  'canieremmett@pleasval.org': 'Emmett Canier',
  'petersdaegus@pleasval.org': 'Daegus Peters',
  'burantbraden@pleasval.org': 'Braden Burant',
  'langjames@pleasval.org': 'James Lang',
  'dinakaransadhana@pleasval.org': 'Sadhana Dinakaran',
  'sattivarun@pleasval.org': 'Varun Satti',
  'pappireddypragnyareddy@pleasval.org': 'Pragnya Pappireddy',
  'rogerslucy@pleasval.org': 'Lucy Rogers',
  'sattivarsha@pleasval.org': 'Varsha Satti',
  'shrivastavaarav@pleasval.org': 'Arav Shrivastava',
  'schroederweston@pleasval.org': 'Weston Schroeder',
  'newmannnicholas@pleasval.org': 'Nicholas Newmann',
  'mankotiaharshita@pleasval.org': 'Harshita Mankotia',
  'franzenburgjason@pleasval.org': 'Jason Franzenburg',
  'seamerbrandon@pleasval.org': 'Brandon Seamer',
  'deshpandeyukti@pleasval.org': 'Yukti Deshpande',
  'meckleykayden@pleasval.org': 'Kayden Meckley',
  'andrew.meckley1981@gmail.com': 'Andrew Meckley',
}

// Roles pre-assigned to an approved email (comma-separated in .role;
// 'member' is the no-roles default).
const inviteRoles = (w) => String(w?.role || '')
  .split(',')
  .map(r => r.trim())
  .filter(r => r && r.toLowerCase() !== 'member')

const inviteName = (email) => {
  const key = (email || '').toLowerCase()
  if (INVITE_NAMES[key]) return INVITE_NAMES[key]
  const local = key.split('@')[0].replace(/[._]+/g, ' ').trim()
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : email
}

function UserManagement({ onViewProfile }) {
  const { user, username } = useUser()
  const { canManageUsers, canAdminAccounts, canChangeRoles, canRequestRoles, hasLeadTag, canManageOwnTeam, myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [whitelistedEmails, setWhitelistedEmails] = useState([])
  const [registeredMembers, setRegisteredMembers] = useState([])

  // A visiting team's controller sees their own people and nobody else's.
  // Done once, here, rather than at each place the list is used — a filter you
  // have to remember is a filter that gets forgotten, and forgetting this one
  // shows another team your roster.
  // Whose roster this is.
  //
  // This only filtered when the viewer ran a team account, so a Radical lead
  // matched everybody and saw every team's people in their own Members list —
  // which meant moving somebody to another team changed nothing you could see.
  //
  // It filters for everyone now, with NULL read as 7196 on both sides, the
  // same convention teamScope uses. Otherwise our own profiles (team_number
  // null) would fail to match our own team number and the list would be empty.
  const teamOf = (p) => String(p?.team_number || HOME_TEAM_NUMBER)
  const onMyTeam = (p) => teamOf(p) === String(myTeamNumber || HOME_TEAM_NUMBER)
  const visibleMembers = registeredMembers.filter(onMyTeam)
  const [activeSection, setActiveSection] = useState('radmems') // 'radmems' | 'mentors' | 'teamro'
  // Direct "Add Member" (no whitelist) — creates the account and sets roles at once
  const [showAddMember, setShowAddMember] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addTier, setAddTier] = useState('teammate')
  const [addRoles, setAddRoles] = useState([])
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)
  // Past members archive
  const [pastMembers, setPastMembers] = useState([])

  // Approved emails that don't already have an account, so nobody is listed
  // twice once they've signed up. (Declared here because the roster below uses it.)
  const memberNameSet = new Set(
    visibleMembers.map(m => (m.display_name || '').trim().toLowerCase()).filter(Boolean)
  )
  const pendingInvites = whitelistedEmails.filter(
    w => !memberNameSet.has(inviteName(w.email).trim().toLowerCase())
  )

  // The address on the profile, which a trigger keeps in step with auth.users.
  // Falls back to matching a whitelist row by name for anyone whose profile
  // predates that column being filled in.
  const emailByName = new Map(
    whitelistedEmails.map(w => [inviteName(w.email).trim().toLowerCase(), w.email])
  )
  const emailFor = (m) =>
    m?.email || emailByName.get((m?.display_name || '').trim().toLowerCase()) || ''

  const [showAddForm, setShowAddForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newTier, setNewTier] = useState('teammate')
  const [bulkText, setBulkText] = useState('')
  const [error, setError] = useState('')
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [resetCopied, setResetCopied] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [createTarget, setCreateTarget] = useState(null)
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [showRoleInfo, setShowRoleInfo] = useState(false)
  const [openGuideRole, setOpenGuideRole] = useState(null)
  const [rolePickerOpen, setRolePickerOpen] = useState(null)
  const [roleRequestOpen, setRoleRequestOpen] = useState(false)
  const [roleRequestSubmitting, setRoleRequestSubmitting] = useState(false)
  const [roleRequestSuccess, setRoleRequestSuccess] = useState('')
  const [loadStatus, setLoadStatus] = useState('')
  const [loadingData, setLoadingData] = useState(true)
  // Teams state
  const [teams, setTeams] = useState([])

  // A team account's coach email belongs to an adult who mentors that team, so
  // they belong on the Mentors tab. The team LOGIN itself is excluded below
  // (the Team tag) because that is a shared account, not a person — what we
  // want is the coach behind it.
  //
  // Skipped when that address already has a profile of its own: Radical's own
  // coach has a real account and should appear once, as themselves, not twice.
  const teamCoachRows = (() => {
    const known = new Set(
      visibleMembers.map(m => (emailFor(m) || '').trim().toLowerCase()).filter(Boolean)
    )
    // This team's coach, not every team's. Without the first filter, `teams`
    // is every row in team_accounts, so ETSTesting's coach email showed up as
    // a coach of Prime Suspects and vice versa — Kayden listed as coaching a
    // team he has nothing to do with.
    //
    // Radical matches no row here, which is right: our own coaches are real
    // profiles carrying the Coach tag and appear as themselves.
    const mine = String(myTeamNumber || HOME_TEAM_NUMBER)
    return (teams || [])
      .filter(t => String(t.team_number) === mine)
      .filter(t => t.email && !known.has(String(t.email).trim().toLowerCase()))
      .map(t => ({
        ...t,
        id: `tc-${t.team_number}`,
        email: t.email,
        display_name: inviteName(t.email),
        function_tags: ['Coach'],
        __teamCoach: true,
      }))
  })()

  // Mentors and coaches are adults, not students — they get their own tab.
  const rosterRows = [
    ...visibleMembers.filter(m => !(m.function_tags || []).includes('Team')),
    ...(canManageUsers ? pendingInvites.map(w => ({ ...w, __invite: true })) : []),
    ...(canManageUsers ? teamCoachRows : []),
  ]

  const isAdultRow = (row) => {
    if (row.__teamCoach) return true
    const tags = row.__invite ? inviteRoles(row) : (row.function_tags || [])
    return tags.some(t => t === 'Mentor' || t === 'Coach')
  }


  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamNumber, setNewTeamNumber] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamPassword, setNewTeamPassword] = useState('')
  const [newTeamLeague, setNewTeamLeague] = useState('')
  const [newCoachName, setNewCoachName] = useState('')
  // A real address for the team. Accounts used to be created as
  // team<number>@teams.radical, which is not a real address: the team could
  // never be told what it was, could never reset their own password, and had
  // nothing to put in the email box at sign-in.
  const [newTeamEmail, setNewTeamEmail] = useState('')
  const [teamError, setTeamError] = useState('')
  const [teamSubmitting, setTeamSubmitting] = useState(false)
  const [whitelistSubSection, setWhitelistSubSection] = useState('members')
  const [invitePickerOpen, setInvitePickerOpen] = useState(null) // whitelist id
  // Team password edit
  // Editing a team's details — name, league, and who coaches it.
  const [editTeam, setEditTeam] = useState(null)
  const [editTeamForm, setEditTeamForm] = useState({ team_name: '', league: '', email: '' })
  const [editTeamError, setEditTeamError] = useState('')
  const [editTeamSaving, setEditTeamSaving] = useState(false)

  const [editTeamPw, setEditTeamPw] = useState(null)
  const [editTeamPwValue, setEditTeamPwValue] = useState('')
  const [editTeamPwError, setEditTeamPwError] = useState('')
  const [editTeamPwSuccess, setEditTeamPwSuccess] = useState('')
  const [editTeamPwSubmitting, setEditTeamPwSubmitting] = useState(false)

  // Direct REST fetch bypasses the Supabase client's auth token lock,
  // which can hang after a hard refresh (Cmd+Shift+R).
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Use the user's JWT so RLS policies (auth.uid()) are satisfied.
  // Read the token SYNCHRONOUSLY from localStorage: supabase.auth.getSession()
  // takes an async auth lock that can hang for seconds after a hard refresh,
  // which made both loading and every delete slow. The token is kept fresh in
  // localStorage by autoRefreshToken, so this is normally instant.
  const getAuthHeaders = async () => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const token = parsed?.access_token
        const expMs = (parsed?.expires_at || 0) * 1000
        // Use it if present and not within 10s of expiry.
        if (token && Date.now() < expMs - 10000) {
          return { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
        }
      }
    } catch { /* fall through to getSession */ }

    // Fallback (token missing/expired): let getSession refresh it, with a short
    // timeout so a stuck lock can't hang the UI, then anon key as last resort.
    try {
      const { data: { session } } = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 1500))
      ])
      const token = session?.access_token || supabaseKey
      return { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` }
    } catch {
      return restHeaders()
    }
  }

  const fetchTable = async (table, columns, headers) => {
    const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}`
    if (!headers) headers = await getAuthHeaders()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(url, { headers, signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status}: ${text}`)
      }
      return res.json()
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }

  const loadData = async () => {
    setLoadingData(true)
    setLoadStatus('')
    let msg = ''
    console.log('[UserMgmt] loadData started')

    try {
      // Resolve the auth token ONCE (getSession can hang up to 3s after a
      // refresh), then fetch all tables in parallel so the timeout isn't
      // paid per-table and the fetches overlap instead of stacking.
      const headers = await getAuthHeaders()

      const [emailsRes, membersRes, teamsRes] = await Promise.allSettled([
        fetchTable('approved_emails', 'id,email,role,created_at', headers),
        fetchTable('profiles', 'id,display_name,email,team_number,function_tags,authority_tier,is_authority_admin,avatar_url', headers)
          .catch(() => fetchTable('profiles', 'id,display_name,function_tags,authority_tier,is_authority_admin,avatar_url', headers)),
        fetchTable('team_accounts', 'team_number,team_name,league,email,user_id,created_at', headers)
          .catch(() => fetchTable('team_accounts', 'team_number,team_name,league,user_id,created_at', headers)),
      ])

      if (emailsRes.status === 'fulfilled') {
        msg += 'Whitelist: ' + emailsRes.value.length + ' rows | '
        setWhitelistedEmails(emailsRes.value)
      } else {
        msg += 'Whitelist error: ' + emailsRes.reason?.message + ' | '
        console.error('[UserMgmt] Whitelist exception:', emailsRes.reason)
      }

      if (membersRes.status === 'fulfilled') {
        msg += 'Members: ' + membersRes.value.length + ' rows'
        setRegisteredMembers(membersRes.value)
      } else {
        msg += 'Members error: ' + membersRes.reason?.message
        console.error('[UserMgmt] Members exception:', membersRes.reason)
      }

      if (teamsRes.status === 'fulfilled') {
        msg += ' | Teams: ' + teamsRes.value.length + ' rows'
        setTeams(teamsRes.value)
      } else {
        msg += ' | Teams error: ' + teamsRes.reason?.message
        console.error('[UserMgmt] Teams exception:', teamsRes.reason)
      }

      console.log('[UserMgmt] loadData finished:', msg)
      setLoadStatus(msg)
    } finally {
      setLoadingData(false)
    }
  }

  // Fetch data once on mount
  useEffect(() => {
    loadData()
  }, [])

  // Load Past Members archive (best-effort; table may not exist yet)
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${supabaseUrl}/rest/v1/past_members?${SCOPE}&select=*&order=removed_at.desc`, { headers })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) setPastMembers(data)
        }
      } catch { /* table may not exist yet — ignore */ }
    })()
  }, [])

  // Realtime: listen for whitelist changes
  useEffect(() => {
    if (!canManageUsers) return
    const channel = supabase
      .channel('approved-emails-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'approved_emails' }, onlyMyTeam((payload) => {
        setWhitelistedEmails(prev => {
          if (prev.some(e => e.id === payload.new.id)) return prev
          return [payload.new, ...prev]
        })
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'approved_emails' }, onlyMyTeam((payload) => {
        setWhitelistedEmails(prev => prev.filter(e => e.id !== payload.old.id))
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [canManageUsers])

  // --- Whitelist handlers ---

  const handleAddEmail = async (e) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    setError('')

    try {
      const body = {
        email: newEmail.toLowerCase().trim(),
        role: newTier,
        added_by: user.id,
      }
      const headers = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/rest/v1/approved_emails`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        if (text.includes('duplicate') || text.includes('23505')) {
          setError('This email is already on the whitelist')
        } else {
          setError(text || res.statusText)
        }
        return
      }
      const rows = await res.json()
      const data = rows[0]
      if (data) {
        setWhitelistedEmails(prev => [data, ...prev])
      }
      setNewEmail('')
      setNewTier('teammate')
      setShowAddForm(false)
    } catch (err) {
      setError('Failed to add email: ' + err.message)
    }
  }

  // Set the role an approved email gets when they sign up (checkWhitelist reads
  // approved_emails.role at signup, so this actually lands on their account).
  const handleSetInviteRole = async (id, role) => {
    setWhitelistedEmails(prev => prev.map(w => w.id === id ? { ...w, role } : w))
    if (invitePickerOpen === id) { /* keep picker open while toggling */ }
    try {
      const headers = await getAuthHeaders()
      await fetch(`${supabaseUrl}/rest/v1/approved_emails?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role }),
      })
    } catch (err) { console.error('Failed to set invite role:', err) }
  }

  const handleRemoveEmail = async (id) => {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/rest/v1/approved_emails?id=eq.${id}`, {
        method: 'DELETE',
        headers,
      })
      if (res.ok) {
        setWhitelistedEmails(prev => prev.filter(e => e.id !== id))
      }
    } catch (err) {
      console.error('Failed to remove email:', err)
    }
  }

  const handleBulkImport = async () => {
    const lines = bulkText
      .split(/[\n,;\s]+/)
      .map(l => l.trim().toLowerCase())
      .filter(l => l && l.includes('@'))
    if (lines.length === 0) {
      setError('No valid emails found. Paste emails separated by newlines, commas, or spaces.')
      return
    }
    setError('')

    let added = []
    let failed = 0
    const headers = await getAuthHeaders()
    for (const email of lines) {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/approved_emails`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ email, role: 'teammate', added_by: user.id }),
        })
        if (!res.ok) {
          failed++
        } else {
          const rows = await res.json()
          if (rows[0]) added.push(rows[0])
        }
      } catch (err) {
        failed++
      }
    }

    if (added.length > 0) {
      setWhitelistedEmails(prev => [...added, ...prev])
    }

    if (failed > 0 && added.length > 0) {
      setError(`Added ${added.length} emails. ${failed} skipped (duplicates or errors).`)
    } else if (failed > 0 && added.length === 0) {
      setError(`All ${failed} emails were already on the whitelist or failed to add.`)
    } else {
      setBulkText('')
      setShowBulkImport(false)
    }
  }

  // --- Team handlers ---

  const handleAddTeam = async (e) => {
    e.preventDefault()
    if (!newTeamNumber.trim() || !newTeamName.trim() || !newTeamPassword.trim() || !newTeamLeague) return
    if (isHomeTeamNumber(newTeamNumber)) {
      setTeamError(`${HOME_TEAM_NUMBER} is us. Team accounts are for visiting teams — add a Radical member from the Members tab instead.`)
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newTeamEmail.trim())) {
      setTeamError("Enter the coach's email — it is how they sign in and how they reset their own password.")
      return
    }
    if (newTeamPassword.length < 6) {
      setTeamError('Password must be at least 6 characters')
      return
    }
    setTeamError('')
    setTeamSubmitting(true)

    try {
      // The coach types their ordinary address; the account is created with
      // the team folded in, so the same coach can run several teams.
      const contactEmail = newTeamEmail.trim().toLowerCase()
      const email = teamAuthEmail(contactEmail, newTeamNumber.trim())
      const headers = await getAuthHeaders()

      // Create Supabase auth account via admin function
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: newTeamPassword,
          // The coach's name. This login is a person — their profile, their
          // display name — and naming it after the team made Jason's profile
          // say "Prime Suspects". Falls back to the team name when no coach
          // name was given, which is still better than the old
          // "Team <number> - <name>".
          displayName: newCoachName.trim() || newTeamName.trim(),
          role: 'member',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (data?.error) throw new Error(data.error)

      // Tags, tier, the team they run, and the address to reach them at —
      // written by the app rather than relying on a trigger.
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${data.userId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          function_tags: ['Team'],
          must_change_password: false,
          authority_tier: 'teammate',
          email: contactEmail,
          team_number: newTeamNumber.trim(),
        }),
      }).catch(err => console.error('Could not finish the team profile:', err))

      // Insert into team_accounts
      const teamRes = await fetch(`${supabaseUrl}/rest/v1/team_accounts`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          team_number: newTeamNumber.trim(),
          team_name: newTeamName.trim(),
          league: newTeamLeague,
          email: contactEmail,
          user_id: data.userId,
        }),
      })
      if (!teamRes.ok) {
        const text = await teamRes.text()
        if (text.includes('duplicate') || text.includes('23505')) {
          throw new Error('A team with this number already exists')
        }
        throw new Error(text || teamRes.statusText)
      }
      const rows = await teamRes.json()
      if (rows[0]) {
        setTeams(prev => [rows[0], ...prev])
      }

      setNewTeamNumber('')
      setNewTeamName('')
      setNewTeamPassword('')
      setNewTeamLeague(''); setNewCoachName('')
      setNewTeamEmail('')
      setShowAddTeam(false)
    } catch (err) {
      setTeamError(err.message)
    } finally {
      setTeamSubmitting(false)
    }
  }

  const openEditTeam = (team) => {
    setEditTeam(team)
    setEditTeamForm({
      team_name: team.team_name || '',
      league: team.league || '',
      email: team.email || '',
    })
    setEditTeamError('')
  }

  const handleSaveTeam = async () => {
    if (!editTeam) return
    const name = editTeamForm.team_name.trim()
    const mail = editTeamForm.email.trim().toLowerCase()
    if (!name) { setEditTeamError('A team needs a name.'); return }
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      setEditTeamError("That does not look like an email address."); return
    }
    setEditTeamSaving(true)
    setEditTeamError('')
    try {
      const headers = await getAuthHeaders()
      const num = editTeam.team_number
      const emailChanged = mail && mail !== (editTeam.email || '').toLowerCase()

      // A new coach means a new login, because the address IS the login. The
      // auth account has to move with it or the new coach cannot get in and
      // the old one still can.
      if (emailChanged) {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: editTeam.user_id, newEmail: teamAuthEmail(mail, num) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.error) {
          throw new Error(
            (data?.error || res.statusText) +
            ' — the name and league were not saved either. The sign-in address can only be changed once admin-reset-password accepts newEmail.'
          )
        }
      }

      await fetch(`${supabaseUrl}/rest/v1/team_accounts?team_number=eq.${encodeURIComponent(num)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ team_name: name, league: editTeamForm.league, email: mail || null }),
      })

      // The profile carries the display name and the address people read.
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${editTeam.user_id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ display_name: name, email: mail || null }),
      }).catch(err => console.error('Could not update the team profile:', err))

      setTeams(prev => prev.map(t => t.team_number === num
        ? { ...t, team_name: name, league: editTeamForm.league, email: mail || null }
        : t))
      setEditTeam(null)
    } catch (err) {
      setEditTeamError(err.message)
    } finally {
      setEditTeamSaving(false)
    }
  }

  const handleEditTeamPassword = async () => {
    setEditTeamPwError('')
    setEditTeamPwSuccess('')
    if (editTeamPwValue.length < 6) {
      setEditTeamPwError('Password must be at least 6 characters')
      return
    }
    setEditTeamPwSubmitting(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editTeamPw.user_id, newPassword: editTeamPwValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (data?.error) throw new Error(data.error)
      // Keep must_change_password false for teams
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${editTeamPw.user_id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ must_change_password: false }),
      })
      setEditTeamPwSuccess('Password updated!')
      setEditTeamPwValue('')
    } catch (err) {
      setEditTeamPwError(err.message)
    } finally {
      setEditTeamPwSubmitting(false)
    }
  }

  const handleDeleteTeam = async (team) => {
    if (!confirm(`Remove Team ${team.team_number} (${team.team_name})?`)) return
    try {
      const headers = await getAuthHeaders()
      // Delete auth user if exists
      if (team.user_id) {
        await fetch(`${supabaseUrl}/functions/v1/admin-delete-user`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: team.user_id }),
        })
      }
      // Delete from team_accounts
      await fetch(`${supabaseUrl}/rest/v1/team_accounts?team_number=eq.${team.team_number}`, {
        method: 'DELETE',
        headers,
      })
      setTeams(prev => prev.filter(t => t.team_number !== team.team_number))
    } catch (err) {
      console.error('Failed to delete team:', err)
    }
  }

  // --- Member role toggle (leads only, not on self) ---

  const handleToggleRole = async (memberId, role) => {
    if (memberId === user.id) return
    const member = registeredMembers.find(m => m.id === memberId)
    if (!member) return
    const currentRoles = member.function_tags || []
    const wasAdded = !currentRoles.includes(role)
    let updated
    if (role === 'Guest') {
      // Adding Guest removes all other roles; removing Guest leaves empty
      updated = wasAdded ? ['Guest'] : []
    } else {
      updated = wasAdded
        ? [...currentRoles.filter(r => r !== 'Guest'), role]
        : currentRoles.filter(r => r !== role)
    }
    // Auto-derive tier from roles
    const newTier = updated.length === 0 || (updated.length === 1 && updated[0] === 'Guest') ? 'guest' : 'teammate'
    // Optimistic update
    setRegisteredMembers(prev => prev.map(m => m.id === memberId ? { ...m, function_tags: updated, authority_tier: newTier } : m))
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${memberId}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ function_tags: updated, authority_tier: newTier }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      // Verify the update actually persisted (PostgREST returns updated rows)
      const rows = await res.json()
      if (!rows || rows.length === 0) {
        throw new Error('Update did not affect any rows — profile may not exist')
      }
      // Sync local state with what the DB actually saved
      const saved = rows[0]
      setRegisteredMembers(prev => prev.map(m => m.id === memberId ? { ...m, function_tags: saved.function_tags, authority_tier: saved.authority_tier } : m))
      // Notify the user about their role change
      const notif = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        user_id: memberId,
        type: 'role_change',
        title: wasAdded ? 'New Role Assigned!' : 'Role Removed',
        body: wasAdded
          ? `You're now a ${role}!`
          : `You're no longer a ${role}.`,
        data: JSON.stringify({ role, action: wasAdded ? 'added' : 'removed' }),
      }
      getAuthHeaders().then(h =>
        fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify(notif),
        })
      ).catch(() => {})
      triggerPush(notif)
    } catch (err) {
      // Rollback
      setRegisteredMembers(prev => prev.map(m => m.id === memberId ? { ...m, function_tags: currentRoles } : m))
      alert('Failed to save role: ' + err.message)
    }
  }

  // --- Role request handler (teammates only) ---

  const handleRequestRole = async (role) => {
    setRoleRequestSubmitting(true)
    setRoleRequestSuccess('')
    try {
      const request = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        type: 'role_request',
        data: { role, current_roles: registeredMembers.find(m => m.id === user.id)?.function_tags || [] },
        requested_by: username,
        requested_by_user_id: user.id,
        status: 'pending',
      }
      const { error } = await supabase.from('requests').insert(stampStored(request))
      if (error) throw error
      notifyRequestReviewers(request)
      setRoleRequestSuccess(`Requested "${role}" — a lead will review it.`)
      setRoleRequestOpen(false)
    } catch (err) {
      alert('Failed to submit role request: ' + err.message)
    } finally {
      setRoleRequestSubmitting(false)
    }
  }

  // --- Modal handlers ---

  const handleResetPassword = async () => {
    setResetError('')
    setResetSuccess('')
    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters')
      return
    }
    setResetSubmitting(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetTarget.id, newPassword: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (data?.error) throw new Error(data.error)
      // Make sure they're prompted to pick their own password at next login,
      // even if the edge function's own flag-setting step didn't land.
      try {
        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${resetTarget.id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ must_change_password: true }),
        })
      } catch { /* the edge function already tries this */ }
      // Do NOT clear resetPassword here. This is the only copy of the temporary
      // password anywhere — clearing it left the lead being told to pass along a
      // secret the screen had just erased, which locked people out of the app.
      setResetSuccess(`Password reset. Give ${resetTarget.display_name} the temporary password below — they'll be asked to pick their own as soon as they log in.`)
      setResetCopied(false)
    } catch (err) {
      setResetError(err.message)
    } finally {
      setResetSubmitting(false)
    }
  }

  const handleDeleteMember = async () => {
    setDeleteError('')
    if (isPermanentMember(deleteTarget)) {
      setDeleteError('This is a permanent account and cannot be deleted.')
      return
    }
    setDeleteSubmitting(true)
    try {
      const headers = await getAuthHeaders()
      // Archive to Past Members FIRST and refuse to delete if it doesn't stick.
      // This used to be a silent try/catch, so when past_members was missing the
      // account was deleted with no record kept — 20 members were lost that way.
      // The archive is the only thing that survives deletion; treat it as
      // required, not best-effort.
      let archived = null
      try {
        const archiveRes = await fetch(`${supabaseUrl}/rest/v1/past_members`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({
            original_id: deleteTarget.id,
            display_name: deleteTarget.display_name,
            function_tags: deleteTarget.function_tags || [],
            avatar_url: deleteTarget.avatar_url || '',
            removed_by: username,
          }),
        })
        if (!archiveRes.ok) throw new Error(await archiveRes.text() || archiveRes.statusText)
        const rows = await archiveRes.json()
        if (!rows || rows.length === 0) throw new Error('archive returned no row')
        archived = rows[0]
      } catch (err) {
        setDeleteError(
          `Could not archive ${deleteTarget.display_name} to Past Members, so the account was NOT deleted. ` +
          `Fix that first (run supabase/past_members.sql). Details: ${err.message}`
        )
        setDeleteSubmitting(false)
        return
      }
      setPastMembers(prev => [{
        id: archived.id || `local-${deleteTarget.id}`,
        display_name: deleteTarget.display_name,
        function_tags: deleteTarget.function_tags || [],
        avatar_url: deleteTarget.avatar_url || '',
        removed_at: archived.removed_at || new Date().toISOString(),
      }, ...prev])

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-delete-user`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: deleteTarget.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (data?.error) throw new Error(data.error)
      // Take them off the signup whitelist too, or they can just re-register
      // (and with profile self-heal they'd reappear). The edge function returns
      // the email; fall back to matching the name we'd derive from an address.
      const wlRow = (data?.email
        ? whitelistedEmails.find(w => (w.email || '').toLowerCase() === String(data.email).toLowerCase())
        : whitelistedEmails.find(w => inviteName(w.email).toLowerCase() === (deleteTarget.display_name || '').toLowerCase()))
      if (wlRow) handleRemoveEmail(wlRow.id)

      // Purge the person's data everywhere else so nothing keeps showing a
      // removed member: attendance, cleanup duties, notifications, push subs.
      // Their open tasks go to Up for Grabs instead of a dangling name.
      // Best-effort — the account itself is already gone.
      const gone = deleteTarget.display_name
      const purgeHeaders = restHeaders({ 'Content-Type': 'application/json' })
      const enc = encodeURIComponent(gone)
      Promise.allSettled([
        fetch(`${supabaseUrl}/rest/v1/attendance_records?username=eq.${enc}`, { method: 'DELETE', headers: purgeHeaders }),
        fetch(`${supabaseUrl}/rest/v1/cleanup_assignments?assigned_username=eq.${enc}`, { method: 'DELETE', headers: purgeHeaders }),
        fetch(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${deleteTarget.id}`, { method: 'DELETE', headers: purgeHeaders }),
        fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${deleteTarget.id}`, { method: 'DELETE', headers: purgeHeaders }),
        fetch(`${supabaseUrl}/rest/v1/tasks?assignee=eq.${enc}`, {
          method: 'PATCH', headers: purgeHeaders,
          body: JSON.stringify({ assignee: '__up_for_grabs__' }),
        }),
      ]).catch(() => {})

      setRegisteredMembers(prev => prev.filter(m => m.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const handleCreateAccount = async () => {
    setCreateError('')
    setCreateSuccess('')
    if (!createDisplayName.trim()) {
      setCreateError('Display name is required')
      return
    }
    if (createPassword.length < 6) {
      setCreateError('Password must be at least 6 characters')
      return
    }
    setCreateSubmitting(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createTarget.email,
          password: createPassword,
          displayName: createDisplayName.trim(),
          role: createTarget.role,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      if (data?.error) throw new Error(data.error)
      setCreateSuccess(`Account created for ${createDisplayName.trim()}. Tell them their temporary password.`)
      setRegisteredMembers(prev => [{
        id: data.userId,
        display_name: data.displayName,
        authority_tier: createTarget.role === 'guest' ? 'guest' : 'teammate',
        created_at: new Date().toISOString(),
      }, ...prev])
      setCreateDisplayName('')
      setCreatePassword('')
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const toggleAddRole = (role) => {
    setAddRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])
  }

  // Direct add: create the account AND assign roles in one step (no whitelist).
  const handleAddMemberDirect = async (e) => {
    e?.preventDefault?.()
    setAddError(''); setAddSuccess('')
    if (!addEmail.trim() || !addName.trim()) { setAddError('Email and name are required'); return }
    if (addPassword.length < 6) { setAddError('Password must be at least 6 characters'); return }
    setAddSubmitting(true)
    try {
      const headers = await getAuthHeaders()
      const tier = addRoles.includes('Guest') ? 'guest' : 'teammate'
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // A visiting team's member carries the team in their address for the
          // same reason the coach does: one person can be on two teams, and an
          // auth account is keyed by address alone. Radical members keep their
          // plain address — ours is the one team nobody is on twice.
          email: canManageOwnTeam && myTeamNumber
            ? teamAuthEmail(addEmail, myTeamNumber)
            : addEmail.trim().toLowerCase(),
          password: addPassword,
          displayName: addName.trim(),
          role: tier === 'guest' ? 'guest' : 'member',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        const why = data?.error || res.statusText || ''
        // The server's own list of who may create logins may not know this
        // person as a lead yet. Rather than stop, let them in the other way:
        // whitelist the address for this team, so the new member signs up
        // themselves with that address and lands on the right team.
        if (canManageOwnTeam && myTeamNumber && (res.status === 401 || res.status === 403 || /only leads|not allowed|forbidden|unauthori[sz]ed/i.test(why))) {
          const wl = await fetch(`${supabaseUrl}/rest/v1/approved_emails`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ email: addEmail.trim().toLowerCase(), role: tier, added_by: user.id, team_number: String(myTeamNumber) }),
          })
          if (!wl.ok) {
            const t = await wl.text()
            if (!/duplicate|23505/.test(t)) throw new Error(`Couldn't create the login (${why}) or whitelist the address (${t}).`)
          }
          setAddSuccess(`Couldn't create the login directly (${why}), so ${addEmail.trim().toLowerCase()} is whitelisted for Team ${myTeamNumber} instead. Have ${addName.trim()} sign up with that address and team number ${myTeamNumber}.`)
          setAddEmail(''); setAddName(''); setAddPassword(''); setAddRoles([]); setAddTier('teammate')
          return
        }
        throw new Error(why)
      }
      // Roles, and — when a visiting team's controller is the one adding —
      // which team the new person is on. An unstamped profile reads as
      // Radical, which is the one default that must never happen by accident,
      // so this is written before the row is shown anywhere.
      // The plain address they'd actually give you, not the tagged one they
      // sign in with — the tag is plumbing, and nobody should have to read it.
      const patch = { email: addEmail.trim().toLowerCase() }
      if (addRoles.length > 0) { patch.function_tags = addRoles; patch.authority_tier = tier }
      if (canManageOwnTeam && myTeamNumber) patch.team_number = String(myTeamNumber)
      // Best effort: the account exists either way, and a missing address on
      // the profile is cosmetic. It must not undo a successful creation.
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${data.userId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(patch),
      }).catch(err => console.error('Could not set profile email/team:', err))
      setRegisteredMembers(prev => [{
        id: data.userId,
        display_name: addName.trim(),
        team_number: canManageOwnTeam && myTeamNumber ? String(myTeamNumber) : null,
        function_tags: addRoles,
        authority_tier: tier,
        avatar_url: '',
        created_at: new Date().toISOString(),
      }, ...prev])
      setAddSuccess(`Added ${addName.trim()}. Tell them their temporary password to log in.`)
      setAddEmail(''); setAddName(''); setAddPassword(''); setAddRoles([]); setAddTier('teammate')
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAddSubmitting(false)
    }
  }

  const bulkCount = bulkText.split(/[\n,;\s]+/).filter(l => l.trim() && l.includes('@')).length

  const tagColors = [
    'bg-purple-100 text-purple-700',
    'bg-green-100 text-green-700',
    'bg-brand-yellow/50 text-pink-700',
    'bg-blue-100 text-blue-700',
    'bg-orange-100 text-orange-700',
    'bg-teal-100 text-teal-700',
  ]

  const getTagColor = (tag) => {
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    return tagColors[Math.abs(hash) % tagColors.length]
  }

  // Find current user's profile for role request
  const myProfile = registeredMembers.find(m => m.id === user?.id)
  const myRoles = myProfile?.function_tags || []

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="py-4 px-4 flex items-center text-gray-200">
          <div className="w-10 shrink-0 text-gray-200" />
          <div className="flex-1 text-center">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
              User Management
            </h1>
            <p className="text-sm text-gray-300">
              {canManageOwnTeam
                ? `Team ${myTeamNumber} — your members`
                : canManageUsers ? 'Manage team access' : 'View team members'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-gray-200">
            <NotificationBell />
            <button
              onClick={() => setShowRoleInfo(true)}
              className="w-10 flex items-center justify-center p-1.5 rounded-lg hover:bg-brand-blue/20 transition-colors"
              title="Role descriptions"
            >
              <Info size={18} className="text-gray-400" />
            </button>
          </div>
        </div>
        {(canManageUsers || canManageOwnTeam) && (
          <div className="flex border-t text-gray-200">
            {[
              { id: 'radmems', label: canManageOwnTeam ? 'Members' : 'RadMems', icon: Users, count: rosterRows.filter(r => !isAdultRow(r)).length },
              { id: 'mentors', label: 'Mentors', icon: GraduationCap, count: rosterRows.filter(isAdultRow).length },
              // Lists and creates other teams — ours to run, never theirs.
              ...(canManageOwnTeam ? [] : [
                { id: 'teamro', label: 'TeamRo', icon: Shield, count: teams.length },
              ]),
            ].map(t => {
              const TabIcon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveSection(t.id)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    activeSection === t.id
                      ? 'text-brand-yellow-dark border-b-2 border-brand-yellow-dark'
                      : 'text-gray-300 hover:text-gray-100'
                  }`}
                >
                  <TabIcon size={14} className="inline mr-1 text-gray-200" />
                  {t.label} ({t.count})
                </button>
              )
            })}
          </div>
        )}
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {loadingData && whitelistedEmails.length === 0 && visibleMembers.length === 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 text-center">
              Loading data...
            </div>
          )}
          {loadStatus && (loadStatus.includes('error') || loadStatus.includes('timeout') || loadStatus.includes('Session')) && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
              <span><strong>Load issue:</strong> {loadStatus}</span>
              <button
                onClick={loadData}
                className="ml-3 px-3 py-1 bg-red-200 hover:bg-red-300 rounded-lg text-red-800 font-medium transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}
          {!loadingData && whitelistedEmails.length === 0 && visibleMembers.length === 0 && !loadStatus.includes('error') && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700 flex items-center justify-between">
              <span>No data loaded. This may be a connection issue.</span>
              <button
                onClick={loadData}
                className="ml-3 px-3 py-1 bg-yellow-200 hover:bg-yellow-300 rounded-lg text-yellow-800 font-medium transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Teammate role request button */}
          {canRequestRoles && (
            <div className="mb-4">
              {roleRequestSuccess && (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 text-center">
                  {roleRequestSuccess}
                </div>
              )}
              <button
                onClick={() => setRoleRequestOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-brand-blue-dark rounded-lg transition-colors text-sm text-gray-700"
              >
                <Send size={16} />
                Request a Role
              </button>
            </div>
          )}

          {activeSection === 'teamro' && canManageUsers && !canManageOwnTeam ? (
            <>
              {/* Team Roster (whitelist email block removed; kept dead behind false) */}
              {false ? (
                <>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => { setShowAddForm(true); setShowBulkImport(false); setError('') }}
                      className="flex items-center gap-2 px-3 py-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg transition-colors text-sm text-gray-700"
                    >
                      <UserPlus size={16} />
                      Add Email
                    </button>
                    <button
                      onClick={() => { setShowBulkImport(true); setShowAddForm(false); setError('') }}
                      className="flex items-center gap-2 px-3 py-2 bg-brand-blue hover:bg-brand-blue-dark rounded-lg transition-colors text-sm text-gray-700"
                    >
                      <Upload size={16} />
                      Bulk Import
                    </button>
                  </div>

                  {showAddForm && (
                    <form onSubmit={handleAddEmail} className="bg-white rounded-xl shadow-sm border p-4 mb-4 space-y-3">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                        autoFocus
                        required
                      />
                      <select
                        value={newTier}
                        onChange={(e) => setNewTier(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                      >
                        <option value="teammate">Member</option>
                        <option value="guest">Guest</option>
                      </select>
                      {error && <p className="text-sm text-red-500">{error}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowAddForm(false); setError('') }}
                          className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg"
                        >
                          Add
                        </button>
                      </div>
                    </form>
                  )}

                  {showBulkImport && (
                    <div className="bg-white rounded-xl shadow-sm border p-4 mb-4 space-y-3">
                      <p className="text-sm text-gray-500">Paste email addresses, one per line. All will be added as &quot;teammate&quot; tier.</p>
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={"student1@school.edu\nstudent2@school.edu\nstudent3@school.edu"}
                        rows={6}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm font-mono"
                        autoFocus
                      />
                      {error && <p className="text-sm text-red-500">{error}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowBulkImport(false); setBulkText(''); setError('') }}
                          className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleBulkImport}
                          className="flex-1 px-3 py-2 text-sm bg-brand-blue hover:bg-brand-blue-dark rounded-lg"
                        >
                          Import {bulkCount} email{bulkCount !== 1 ? 's' : ''}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {loadingData ? (
                      <p className="text-center text-gray-400 mt-10 animate-pulse">Loading emails...</p>
                    ) : whitelistedEmails.length === 0 ? (
                      <p className="text-center text-gray-400 mt-10">No whitelisted emails yet. Add emails to allow team members to sign up.</p>
                    ) : (
                      whitelistedEmails.map((entry) => (
                        <div key={entry.id} className="group flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 block truncate">{entry.email}</span>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full mr-3 ${
                            entry.role === 'guest' ? 'bg-yellow-100 text-yellow-700' : 'bg-brand-blue/50 text-blue-700'
                          }`}>
                            {entry.role === 'guest' ? 'Guest' : 'Member'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setCreateTarget(entry); setCreateDisplayName(''); setCreatePassword(''); setCreateError(''); setCreateSuccess('') }}
                              title="Create account"
                              className="p-1.5 rounded-lg hover:bg-brand-blue/20 transition-colors"
                            >
                              <UserPlus size={14} className="text-gray-400 hover:text-brand-blue-dark" />
                            </button>
                            <button
                              onClick={() => handleRemoveEmail(entry.id)}
                              className="opacity-60 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 transition-opacity"
                            >
                              <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                /* Teams sub-section */
                <>
                  <div className="mb-4">
                    <button
                      onClick={() => { setShowAddTeam(true); setTeamError('') }}
                      className="flex items-center gap-2 px-3 py-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg transition-colors text-sm text-gray-700"
                    >
                      <Plus size={16} />
                      Add Team
                    </button>
                  </div>

                  {showAddTeam && (
                    <form onSubmit={handleAddTeam} className="bg-white rounded-xl shadow-sm border p-4 mb-4 space-y-3">
                      <input
                        type="text"
                        value={newTeamNumber}
                        onChange={(e) => setNewTeamNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="Team number (e.g. 254)"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                        autoFocus
                        required
                      />
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Team name (e.g. The Cheesy Poofs)"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                        required
                      />
                      <select
                        value={newTeamLeague}
                        onChange={(e) => setNewTeamLeague(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm bg-white"
                        required
                      >
                        <option value="" disabled>Select league...</option>
                        {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <input
                        type="email"
                        value={newTeamEmail}
                        onChange={(e) => setNewTeamEmail(e.target.value)}
                        placeholder="Coach email"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                        required
                      />
                      {/* The account belongs to a person, so it is named after
                          one. Without this the login was called after the team
                          and the coach's own profile read as a team. */}
                      <input
                        type="text"
                        value={newCoachName}
                        onChange={(e) => setNewCoachName(e.target.value)}
                        placeholder="Coach name"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                      />
                      <PasswordInput
                        value={newTeamPassword}
                        onChange={(e) => setNewTeamPassword(e.target.value)}
                        placeholder="Password (min 6 characters)"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
                      />
                      <p className="text-[11px] text-gray-400">
                        The coach signs in with the team number, this email and
                        this password — and adds the rest of their team
                        themselves.
                      </p>
                      {teamError && <p className="text-sm text-red-500">{teamError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowAddTeam(false); setTeamError(''); setNewTeamNumber(''); setNewTeamName(''); setNewTeamLeague(''); setNewTeamEmail(''); setNewTeamPassword('') }}
                          className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={teamSubmitting || !newTeamNumber || !newTeamName || !newTeamLeague || !newTeamEmail || !newTeamPassword}
                          className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-medium text-gray-700"
                        >
                          {teamSubmitting ? 'Creating...' : 'Add Team'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    {loadingData ? (
                      <p className="text-center text-gray-400 mt-10 animate-pulse">Loading teams...</p>
                    ) : teams.length === 0 ? (
                      <p className="text-center text-gray-400 mt-10">No teams added yet. Add teams so they can log in with their team number.</p>
                    ) : (
                      teams.map((team) => (
                        <div key={team.team_number} className="group flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-700 block">Team {team.team_number}</span>
                            <span className="text-xs text-gray-500 block truncate">{team.team_name}</span>
                            {team.league && <span className="text-xs text-gray-400 block truncate">{team.league}</span>}
                            {team.email && <span className="text-xs text-gray-400 block truncate">{team.email}</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditTeam(team)}
                              title="Edit team details"
                              className="p-1.5 rounded-lg hover:bg-brand-blue/20 transition-colors"
                            >
                              <Pencil size={14} className="text-gray-400 hover:text-brand-blue-dark" />
                            </button>
                            <button
                              onClick={() => { setEditTeamPw(team); setEditTeamPwValue(''); setEditTeamPwError(''); setEditTeamPwSuccess('') }}
                              title="Edit password"
                              className="p-1.5 rounded-lg hover:bg-brand-blue/20 transition-colors"
                            >
                              <KeyRound size={14} className="text-gray-400 hover:text-brand-blue-dark" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(team)}
                              className="opacity-60 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 transition-opacity"
                            >
                              <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {canManageUsers && (
                <div className="mb-4">
                  {addSuccess && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{addSuccess}</div>}
                  {!showAddMember ? (
                    <button
                      onClick={() => { setShowAddMember(true); setAddError(''); setAddSuccess('') }}
                      className="flex items-center gap-2 px-3 py-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg transition-colors text-sm text-gray-700"
                    >
                      <UserPlus size={16} />
                      Add Member
                    </button>
                  ) : (
                    <form onSubmit={handleAddMemberDirect} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
                      <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email address" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm" autoFocus required />
                      <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Display name" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm" required />
                      <PasswordInput value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="Temporary password (they'll change it at first login)" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm" />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Roles (decides their side &amp; access)</label>
                        <div className="space-y-2.5">
                          {ROLE_GROUPS.map(group => (
                            <div key={group.label}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{group.label}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {group.roles.map(role => (
                                  <button
                                    key={role}
                                    type="button"
                                    onClick={() => toggleAddRole(role)}
                                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${addRoles.includes(role) ? getTagColor(role) : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                  >
                                    {role}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {addError && <p className="text-sm text-red-500">{addError}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setShowAddMember(false); setAddError(''); setAddEmail(''); setAddName(''); setAddPassword(''); setAddRoles([]) }} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
                        <button type="submit" disabled={addSubmitting} className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-medium text-gray-700">{addSubmitting ? 'Adding...' : 'Add Member'}</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
              {loadingData ? (
                <p className="text-center text-gray-400 mt-10 animate-pulse">Loading members...</p>
              ) : visibleMembers.length === 0 ? (
                <p className="text-center text-gray-400 mt-10">No registered members yet.</p>
              ) : (
                (() => {
                  const isTeamAccount = (m) => (m.function_tags || []).includes('Team')
                  const regularMembers = visibleMembers.filter(m => !isTeamAccount(m))

                  // Sort co-founders first
                  const isCofounder = (m) => PERMANENT_COFOUNDER_NAMES.some(n => m.display_name?.toLowerCase().includes(n))
                  const sorted = [...regularMembers].sort((a, b) => {
                    const aIsCo = isCofounder(a)
                    const bIsCo = isCofounder(b)
                    if (aIsCo && !bIsCo) return -1
                    if (!aIsCo && bIsCo) return 1
                    return 0
                  })

                  // One card for both real members and approved-but-unregistered
                  // emails. Passing `invite` swaps only the handlers and the chip
                  // row — the markup is shared so the two can't drift apart.
                  const renderMember = (member, invite = null) => {
                    const memberIsCofounder = !invite && isCofounder(member)
                    const memberRoles = member.function_tags || []
                    const isSelf = !invite && member.id === user.id
                    return (
                      <div key={invite ? `w-${invite.id}` : member.id} className="group bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => onViewProfile?.(invite ? `invite:${invite.id}` : member.id)}
                            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity"
                            title="View profile"
                          >
                            {/* Tie-dye ring showing the member's side(s) */}
                            <span className="shrink-0 rounded-full p-[2px]" style={getSideStyle(member.function_tags)}>
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-white" />
                              ) : (
                                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-blue to-brand-yellow flex items-center justify-center ring-2 ring-white text-xs font-bold text-white">
                                  {(member.display_name || '?').charAt(0).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-gray-700 truncate hover:underline">
                                {member.display_name}
                                {isSelf && <span className="ml-1 text-xs font-normal text-gray-400">(you)</span>}
                              </span>
                              {(invite?.email || emailFor(member)) && (
                                <span className="block text-[11px] text-gray-400 truncate">
                                  {invite?.email || emailFor(member)}
                                </span>
                              )}
                            </span>
                          </button>
                          {canAdminAccounts && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  if (invite) {
                                    setAddEmail(invite.email)
                                    setAddName(member.display_name)
                                    setAddPassword(''); setAddRoles(member.function_tags || [])
                                    setAddError(''); setAddSuccess(''); setShowAddMember(true)
                                    window.scrollTo({ top: 0, behavior: 'smooth' })
                                  } else {
                                    setResetTarget(member); setResetPassword(''); setResetError(''); setResetSuccess(''); setResetCopied(false)
                                  }
                                }}
                                title={invite ? 'Create their login' : 'Reset password'}
                                className="p-1.5 rounded-lg hover:bg-brand-blue/20 transition-colors"
                              >
                                <KeyRound size={14} className="text-gray-400 hover:text-brand-blue-dark" />
                              </button>
                              {invite ? (
                                <button
                                  onClick={() => {
                                    if (confirm(`Remove ${invite.email} from the approved list? They won't be able to sign up.`)) {
                                      handleRemoveEmail(invite.id)
                                    }
                                  }}
                                  title="Remove from approved list"
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                                </button>
                              ) : !isSelf && isPermanentMember(member) ? (
                                <span
                                  title="Permanent account — cannot be deleted"
                                  className="p-1.5 rounded-lg"
                                >
                                  <Shield size={14} className="text-brand-yellow-dark" />
                                </span>
                              ) : !isSelf && (
                                <button
                                  onClick={() => { setDeleteTarget(member); setDeleteError('') }}
                                  title="Delete member"
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {memberIsCofounder && (
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getTagColor('Co-Founder')}`}>
                              Co-Founder
                            </span>
                          )}
                          {memberRoles.filter(r => !(memberIsCofounder && r === 'Co-Founder')).map(role => (
                            <span
                              key={role}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium ${getTagColor(role)}`}
                            >
                              {role}
                            </span>
                          ))}
                          {memberRoles.length === 0 && !memberIsCofounder && (
                            <span className="text-xs text-gray-400">
                              {invite ? 'No roles — tap the name to assign' : 'No roles — open profile to assign'}
                            </span>
                          )}
                        </div>

                      </div>
                    )
                  }

                  // Team accounts live in the TeamRo tab, not under RadMems.
                  // Approved emails render as member cards in the SAME list, sorted
                  // in by name, each noting it has no account yet. profiles has no
                  // email column, so a whitelist row can't be matched to an existing
                  // account — hence "no account yet" rather than a signup claim.
                  // Interleave: members keep their co-founders-first order, then
                  // everything sorts together by the name shown on the card.
                  const nameOf = (row) => (row.__invite ? inviteName(row.email) : row.display_name || '').toLowerCase()
                  const combined = canManageUsers
                    ? [...sorted, ...pendingInvites.map(w => ({ ...w, __invite: true })), ...teamCoachRows]
                        .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
                    : sorted

                  // Mentors and coaches have their own tab, so each list shows
                  // only its own people.
                  const shown = combined.filter(r => isAdultRow(r) === (activeSection === 'mentors'))

                  return (
                    <>
                      {shown.length === 0 ? (
                        <p className="text-center text-gray-400 mt-10">
                          {activeSection === 'mentors' ? 'No mentors or coaches yet.' : 'No members yet.'}
                        </p>
                      ) : shown.map(row => (row.__invite
                        ? renderMember(
                            { id: `w-${row.id}`, display_name: inviteName(row.email), function_tags: inviteRoles(row), avatar_url: '' },
                            row
                          )
                        : renderMember(row)))}
                    </>
                  )
                })()
              )}
            </div>
          )}
        </div>
      </main>

      {/* Role Picker Modal (leads adding roles to others) */}
      {rolePickerOpen && (() => {
        const member = registeredMembers.find(m => m.id === rolePickerOpen)
        if (!member) return null
        const isCofounder = PERMANENT_COFOUNDER_NAMES.some(n => member.display_name?.toLowerCase().includes(n))
        const memberRoles = member.function_tags || []
        const available = ALL_ROLES.filter(r => !memberRoles.includes(r) && !(isCofounder && r === 'Co-Founder'))
        return (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setRolePickerOpen(null)}>
            <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:w-80 max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-gray-700 text-sm">Add role to {member.display_name}</h3>
                <button onClick={() => setRolePickerOpen(null)} className="p-1 rounded hover:bg-gray-100">
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
              {available.length === 0 ? (
                <p className="text-sm text-gray-400 px-4 py-6 text-center">All roles assigned</p>
              ) : (
                <div className="py-1">
                  {ROLE_GROUPS.map(group => {
                    const roles = group.roles.filter(r => available.includes(r))
                    if (roles.length === 0) return null
                    return (
                      <div key={group.label}>
                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
                        {roles.map(role => (
                          <button
                            key={role}
                            onClick={() => {
                              handleToggleRole(member.id, role)
                              setRolePickerOpen(null)
                            }}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-brand-blue/20 active:bg-brand-blue/30 transition-colors text-gray-600 border-b border-gray-50"
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Role Request Modal (teammates requesting roles for themselves) */}
      {roleRequestOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setRoleRequestOpen(false)}>
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:w-80 max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 text-sm">Request a Role</h3>
              <button onClick={() => setRoleRequestOpen(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            {(() => {
              const available = ALL_ROLES.filter(r => !myRoles.includes(r))
              return available.length === 0 ? (
                <p className="text-sm text-gray-400 px-4 py-6 text-center">You have all available roles</p>
              ) : (
                <div className="py-1">
                  {ROLE_GROUPS.map(group => {
                    const roles = group.roles.filter(r => available.includes(r))
                    if (roles.length === 0) return null
                    return (
                      <div key={group.label}>
                        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
                        {roles.map(role => (
                          <button
                            key={role}
                            disabled={roleRequestSubmitting}
                            onClick={() => handleRequestRole(role)}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-brand-blue/20 active:bg-brand-blue/30 transition-colors text-gray-600 border-b border-gray-50 disabled:opacity-50"
                          >
                            {role}
                            <span className="block text-xs text-gray-400 mt-0.5">{ROLE_DESCRIPTIONS[role]}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Create Account Modal */}
      {createTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-700">
              Create Account
            </h3>
            <p className="text-sm text-gray-500">{createTarget.email}</p>
            <input
              type="text"
              value={createDisplayName}
              onChange={(e) => { setCreateDisplayName(e.target.value); setCreateError(''); setCreateSuccess('') }}
              placeholder="Display name"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              autoFocus
            />
            <PasswordInput
              value={createPassword}
              onChange={(e) => { setCreatePassword(e.target.value); setCreateError(''); setCreateSuccess('') }}
              placeholder="Temporary password (min 6 characters)"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
            {createError && <p className="text-sm text-red-500">{createError}</p>}
            {createSuccess && <p className="text-sm text-green-600">{createSuccess}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setCreateTarget(null)}
                className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                {createSuccess ? 'Close' : 'Cancel'}
              </button>
              {!createSuccess && (
                <button
                  onClick={handleCreateAccount}
                  disabled={createSubmitting || !createDisplayName || !createPassword}
                  className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-medium text-gray-700"
                >
                  {createSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Member Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-700">
              Remove {deleteTarget.display_name}?
            </h3>
            <p className="text-sm text-gray-500">
              This will permanently delete their account. They will need to be re-created to access the app again.
            </p>
            {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMember}
                disabled={deleteSubmitting}
                className="flex-1 px-3 py-2 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-lg font-medium text-white"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-700">
              Reset Password for {resetTarget.display_name}
            </h3>
            {!resetSuccess && (
              <PasswordInput
                value={resetPassword}
                onChange={(e) => { setResetPassword(e.target.value); setResetError(''); setResetSuccess('') }}
                placeholder="New password (min 6 characters)"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                autoFocus
              />
            )}
            {resetError && <p className="text-sm text-red-500">{resetError}</p>}
            {resetSuccess && (
              <>
                <p className="text-sm text-green-600">{resetSuccess}</p>
                <div className="rounded-lg border-2 border-dashed border-brand-blue bg-brand-blue/10 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Temporary password</p>
                  <p className="font-mono text-base text-gray-800 break-all select-all">{resetPassword}</p>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(resetPassword)
                        .then(() => { setResetCopied(true); setTimeout(() => setResetCopied(false), 2000) })
                        .catch(() => {})
                    }}
                    className="text-xs px-2 py-1 rounded-lg bg-white border hover:bg-gray-50 text-gray-600"
                  >
                    {resetCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  Write it down before closing — it isn't stored anywhere and can't be shown again.
                </p>
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setResetTarget(null); setResetPassword(''); setResetSuccess(''); setResetCopied(false) }}
                className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                {resetSuccess ? 'Close' : 'Cancel'}
              </button>
              {!resetSuccess && (
                <button
                  onClick={handleResetPassword}
                  disabled={resetSubmitting || !resetPassword}
                  className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-medium text-gray-700"
                >
                  {resetSubmitting ? 'Resetting...' : 'Reset'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Team Password Edit Modal */}
      {editTeam && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
             onClick={() => !editTeamSaving && setEditTeam(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-800">Team {editTeam.team_number}</h3>
                <p className="text-xs text-gray-400">The number stays — it is part of how they sign in.</p>
              </div>
              <button onClick={() => setEditTeam(null)} className="text-gray-400 hover:text-gray-700 shrink-0">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              value={editTeamForm.team_name}
              onChange={e => { setEditTeamForm(f => ({ ...f, team_name: e.target.value })); setEditTeamError('') }}
              placeholder="Team name"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
            />

            <select
              value={editTeamForm.league}
              onChange={e => setEditTeamForm(f => ({ ...f, league: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm bg-white"
            >
              <option value="">No league</option>
              {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            <input
              type="email"
              value={editTeamForm.email}
              onChange={e => { setEditTeamForm(f => ({ ...f, email: e.target.value })); setEditTeamError('') }}
              placeholder="Coach email"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent text-sm"
            />

            {/* Changing this changes who can sign in, so say so before they do
                rather than after. */}
            {editTeamForm.email.trim().toLowerCase() !== (editTeam.email || '').toLowerCase() && (
              <p className="text-[11px] text-brand-silver-dark">
                This changes who signs in. The old coach will no longer be able
                to, and the new one uses this address with the team's existing
                password — set them a new one with the key button if they need it.
              </p>
            )}

            {editTeamError && <p className="text-sm text-red-500">{editTeamError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditTeam(null)}
                disabled={editTeamSaving}
                className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTeam}
                disabled={editTeamSaving || !editTeamForm.team_name.trim()}
                className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-medium text-gray-700"
              >
                {editTeamSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTeamPw && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-700">
              Edit Password for Team {editTeamPw.team_number}
            </h3>
            <p className="text-sm text-gray-500">{editTeamPw.team_name}</p>
            <PasswordInput
              value={editTeamPwValue}
              onChange={(e) => { setEditTeamPwValue(e.target.value); setEditTeamPwError(''); setEditTeamPwSuccess('') }}
              placeholder="New password (min 6 characters)"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
              autoFocus
            />
            {editTeamPwError && <p className="text-sm text-red-500">{editTeamPwError}</p>}
            {editTeamPwSuccess && <p className="text-sm text-green-600">{editTeamPwSuccess}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setEditTeamPw(null)}
                className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                {editTeamPwSuccess ? 'Close' : 'Cancel'}
              </button>
              {!editTeamPwSuccess && (
                <button
                  onClick={handleEditTeamPassword}
                  disabled={editTeamPwSubmitting || !editTeamPwValue}
                  className="flex-1 px-3 py-2 text-sm bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-lg font-medium text-gray-700"
                >
                  {editTeamPwSubmitting ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Role Descriptions Modal */}
      {showRoleInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowRoleInfo(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-xl">
              <div>
                <h3 className="font-semibold text-gray-700">Roles &amp; What They Do</h3>
                <p className="text-xs text-gray-400">Tap a role to see its objectives.</p>
              </div>
              <button onClick={() => setShowRoleInfo(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto">
              {ROLE_GUIDE.map(group => (
                <div key={group.category}>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.category}</h4>
                  <div className="space-y-2">
                    {group.roles.map(r => {
                      const open = openGuideRole === r.name
                      return (
                        <div key={r.name} className="border border-gray-100 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setOpenGuideRole(open ? null : r.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                          >
                            <ChevronRight size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${getTagColor(r.name)}`}>{r.name}</span>
                            <span className="text-xs text-gray-500 truncate">{r.summary}</span>
                          </button>
                          {open && (
                            <div className="px-3 pb-3 pt-1 space-y-3">
                              <p className="text-sm text-gray-600">{r.summary}</p>
                              {r.objectives?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 mb-1">Common objectives</p>
                                  <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-600">
                                    {r.objectives.map((o, i) => <li key={i}>{o}</li>)}
                                  </ul>
                                </div>
                              )}
                              {r.sources?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 mb-1">Objectives come from</p>
                                  <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-600">
                                    {r.sources.map((s, i) => <li key={i}>{s}</li>)}
                                  </ul>
                                </div>
                              )}
                              {r.example && (
                                <p className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-2">
                                  <span className="font-semibold not-italic text-gray-600">Example: </span>{r.example}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
