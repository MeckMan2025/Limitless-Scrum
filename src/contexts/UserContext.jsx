import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { restHeaders, startSessionKeeper } from '../lib/restHeaders'
import { supabase, arrivedFromRecoveryLink } from '../supabase'
import { HOME_TEAM_NUMBER } from '../data/team'

const UserContext = createContext(null)
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000 // 30 days

export function UserProvider({ children }) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const [roleChangeAlert, setRoleChangeAlert] = useState(null) // kept for context API compat
  // Diagnostic for the role-sync problem: what the last profile read did.
  const [profileSync, setProfileSync] = useState({ at: null, source: 'none', error: '' })
  const pollProfileRef = useRef(null)
  const [username, setUsername] = useState('')
  const [isLead, setIsLead] = useState(false)
  const [role, setRole] = useState(() => localStorage.getItem('scrum-role') || 'member')
  const [secondaryRoles, setSecondaryRoles] = useState(() => {
    try {
      const cached = localStorage.getItem('scrum-secondary-roles')
      return cached ? JSON.parse(cached) : []
    } catch (e) { return [] }
  })
  const [authorityTier, setAuthorityTier] = useState(() => localStorage.getItem('scrum-authority-tier') || 'guest')
  const [isAuthorityAdmin, setIsAuthorityAdmin] = useState(() => localStorage.getItem('scrum-is-authority-admin') === 'true')
  const [primaryRoleLabel, setPrimaryRoleLabel] = useState(() => localStorage.getItem('scrum-primary-role-label') || '')
  const [functionTags, setFunctionTags] = useState(() => {
    try {
      const cached = localStorage.getItem('scrum-function-tags')
      return cached ? JSON.parse(cached) : []
    } catch (e) { return [] }
  })
  const [shortBio, setShortBio] = useState(() => localStorage.getItem('scrum-short-bio') || '')
  const [nickname, setNickname] = useState(() => localStorage.getItem('scrum-nickname') || '')
  const [useNickname, setUseNickname] = useState(() => localStorage.getItem('scrum-use-nickname') === 'true')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(arrivedFromRecoveryLink)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isTeam, setIsTeam] = useState(() => localStorage.getItem('scrum-is-team') === 'true')
  // The one account per visiting team that can add and remove its own members.
  // It is team_accounts.user_id — there is exactly one, so it belongs on the
  // team row rather than as a tag anyone could be given.
  const [isTeamController, setIsTeamController] = useState(false)
  // A sister team runs the whole app rather than just boards. The flag lives
  // on the team row, so turning one on is a database change and not a deploy.
  // Seeded from the last answer rather than false.
  //
  // This decides which tabs a sister team gets, and it arrives from a lookup
  // that takes a moment. Starting at false meant every refresh built the
  // cut-down tab list first and only sometimes rebuilt it when the real answer
  // landed — the team's features came and went depending on which finished
  // first. The stored value is a guess, corrected a beat later by the lookup
  // either way; it just stops the guess from being wrong every time.
  const [teamFullAccess, setTeamFullAccess] = useState(
    () => { try { return localStorage.getItem('scrum-team-full-access') === 'true' } catch { return false } }
  )

  // One place to set it, so the remembered copy cannot drift from the state.
  const applyTeamFullAccess = (v) => {
    setTeamFullAccess(!!v)
    try { localStorage.setItem('scrum-team-full-access', String(!!v)) } catch { /* ignore */ }
  }
  const [teamNumber, setTeamNumber] = useState(() => localStorage.getItem('scrum-team-number') || '')

  // Auth account exists but its profile row is gone (deleted members were
  // removed from `profiles` while their auth user survived). Rebuild the
  // profile from the email so the person can get back in instead of being
  // bounced out forever.
  const ensureProfile = async (authUser) => {
    if (!authUser?.id) return null
    const email = (authUser.email || '').toLowerCase()
    // Name from the whitelist's shape (lastfirst@school) — a lead can rename.
    const local = email.split('@')[0].replace(/[._0-9]+/g, ' ').trim()
    const guess = local ? local.charAt(0).toUpperCase() + local.slice(1) : email
    // Roles a lead pre-assigned to this address, if any.
    let tags = []
    try {
      const wl = await supabase.rpc('check_approved_email', { p_email: email })
      tags = String(wl?.data || '')
        .split(',').map(r => r.trim()).filter(r => r && r.toLowerCase() !== 'member')
    } catch { /* ignore */ }
    const row = {
      id: authUser.id,
      display_name: guess,
      role: 'member',
      authority_tier: tags.length > 0 ? 'teammate' : 'guest',
      function_tags: tags,
    }
    const { error } = await supabase.from('profiles').insert(row)
    if (error) { console.error('Could not rebuild profile:', error.message); return null }
    console.warn('[Auth] Rebuilt a missing profile for', email)
    return row
  }

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error) {
      setProfileSync({ at: Date.now(), source: 'client', error: '' })
      return data
    }
    console.error('Failed to fetch profile via client:', error.message)

    // Fall back to the anon REST endpoint, which is how the rest of the app
    // reads. The client call runs as the authenticated role; if that read is
    // blocked the profile never loads, and roles silently never update.
    try {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        headers: restHeaders(),
      })
      if (!res.ok) {
        setProfileSync({ at: Date.now(), source: 'failed', error: `client: ${error.message} | rest: ${res.status}` })
        return null
      }
      const rows = await res.json()
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null
      setProfileSync({
        at: Date.now(),
        source: row ? 'rest' : 'failed',
        error: row ? `client failed: ${error.message}` : `client: ${error.message} | rest: no row`,
      })
      return row
    } catch (e) {
      setProfileSync({ at: Date.now(), source: 'failed', error: `client: ${error.message} | rest threw: ${e.message}` })
      console.error('Profile REST fallback failed:', e)
      return null
    }
  }

  const checkWhitelist = async (email) => {
    // Asked before this person has an account, so it cannot require being
    // signed in. It goes through a function rather than reading the table
    // because the table is the list of every address we have invited, and
    // that is not something to leave readable by anyone with the public key.
    // The function answers about one address and nothing else.
    const addr = email.toLowerCase().trim()
    const { data, error } = await supabase.rpc('check_approved_email', { p_email: addr })

    if (error || !data) return null
    return { email: addr, role: data }
  }

  const ADMIN_EMAILS = ['deshpandeyukti@pleasval.org', 'meckleykayden@pleasval.org']

  const TEAM_EMAIL_REGEX = /^team(\d+)@teams\.radical$/

  // A team row pointing at this account means this account runs that team.
  // Best effort: before the column exists, or if the lookup fails, nobody is a
  // controller — which locks the feature rather than opening it.
  const checkTeamController = async (userId, teamNum, attempt = 0, tagFullAccess = false) => {
    if (!userId) { setIsTeamController(false); applyTeamFullAccess(tagFullAccess); return }
    try {
      // These two answers decide whether a coach is a lead of their own team,
      // so they have to be asked as that coach. team_accounts is behind RLS
      // now: a request carrying the public key gets an empty list rather than
      // an error, which this function would read as "not a controller" and
      // quietly strip a coach of every lead power they have.
      //
      // So wait for a real session rather than trusting whatever is cached,
      // and if there is no token yet, try again shortly instead of settling
      // on the answer that locks them out.
      let token = null
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
        ])
        token = data?.session?.access_token || null
      } catch { /* fall through to the cached one */ }
      if (!token) {
        if (attempt < 3) {
          setTimeout(() => checkTeamController(userId, teamNum, attempt + 1, tagFullAccess), 600)
          return
        }
        // Out of tries: leave it locked, which is the safe direction.
        setIsTeamController(false)
        applyTeamFullAccess(tagFullAccess)
        return
      }
      const authed = { apikey: anonKey, Authorization: `Bearer ${token}` }
      // Two questions, one trip: does this account run a team, and does the
      // team this person is on run the whole app. The second is asked by
      // team number rather than by user id, because every member of a sister
      // team needs the answer, not only its coach.
      const [mineRes, teamRes] = await Promise.all([
        fetch(`${url}/rest/v1/team_accounts?select=team_number&user_id=eq.${userId}&limit=1`,
          { headers: authed }),
        teamNum
          ? fetch(`${url}/rest/v1/team_accounts?select=full_access&team_number=eq.${encodeURIComponent(teamNum)}&limit=1`,
              { headers: authed })
          : Promise.resolve(null),
      ])
      const mine = mineRes.ok ? await mineRes.json() : []
      setIsTeamController(Array.isArray(mine) && mine.length > 0)

      const team = teamRes && teamRes.ok ? await teamRes.json() : []
      applyTeamFullAccess(tagFullAccess || !!team?.[0]?.full_access)
    } catch {
      // Locks the feature rather than opening it.
      setIsTeamController(false)
      applyTeamFullAccess(tagFullAccess)
    }
  }

  // email param avoids stale-closure issues when called from useEffect callbacks
  const applyProfile = (profile, email) => {
    if (profile) {
      const userEmail = (email || user?.email || '')?.toLowerCase()
      const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail)

      // Detect team accounts by email pattern
      const teamMatch = userEmail && userEmail.match(TEAM_EMAIL_REGEX)
      // A team account is a shared login that stands in for a whole team: a
      // plus-addressed team address, or the Team tag the add-team form sets.
      //
      // Carrying a team number is NOT enough on its own. The thirteen who
      // moved to Prime Suspects carry 38350 and are people, with their own
      // names, roles and notebook entries — classifying them as team accounts
      // gave them a shared login's cut-down tab set.
      const isTeamAccount = !!teamMatch
        || (profile.function_tags || []).includes('Team')
      // Which team this person is on.
      //
      // A visiting team must NEVER fall back to ours. It did: the fallback was
      // HOME_TEAM_NUMBER for everybody, so a team account whose profile had no
      // team_number — and whose address no longer matches the old
      // team<n>@teams.radical pattern — came out as 7196. That made every
      // board they created ours, and every board tagged 7196 theirs.
      //
      // So the fallback is split: ours only for people who are actually ours.
      // A team account with no number resolves to empty, and everything
      // downstream treats empty as "load nothing", which is the safe failure.
      //
      // The profile decides, full stop. Sign-in refuses a team number that
      // does not match it, so by the time we are here the two agree — and a
      // person taken off a roster cannot type the old number and carry on,
      // which is the point of taking them off.
      //
      // This used to let anyone on a sister team resolve to 7196 so the
      // thirteen could keep writing to Radical. That also meant being removed
      // from a roster stopped nothing, so it is gone.
      // Which team this session is on.
      //
      // Normally the profile decides and sign-in refuses anything else. The
      // exception is extra_teams: a mentor or coach who helps another team
      // signs in with that team's number, and for that session they are on it
      // — their own team's data is not what they came for.
      const signInTeam = (localStorage.getItem('scrum-signin-team') || '').trim()
      const alsoAllowed = (profile.extra_teams || []).map(String)
      const teamNum = isTeamAccount
        ? (profile.team_number || (teamMatch ? teamMatch[1] : ''))
        : (signInTeam && alsoAllowed.includes(signInTeam)
            ? signInTeam
            : (profile.team_number || HOME_TEAM_NUMBER))
      setIsTeam(isTeamAccount)
      setTeamNumber(teamNum)
      localStorage.setItem('scrum-is-team', String(isTeamAccount))
      localStorage.setItem('scrum-team-number', teamNum)

      // Does this team run the whole app?
      //
      // This was a lookup against team_accounts, and it kept losing: the Sidebar,
      // the tabs and the dashboard all render before a fetch can answer, and if
      // the request failed — no session token yet, most often — the fallback was
      // "no", which hides every feature. Six attempts at narrowing that race
      // later, the answer is to stop racing: the flag rides on the profile,
      // which is already loaded here and which everything else waits for.
      //
      // team_accounts.full_access stays the source of truth, and the lookup
      // below still runs and can only ever turn this ON, never off.
      const tagFullAccess = (profile.function_tags || []).includes('FullAccess')
      if (tagFullAccess) applyTeamFullAccess(true)
      checkTeamController(profile.id, teamNum, 0, tagFullAccess)
      setUsername(profile.display_name)
      localStorage.setItem('scrum-cached-user-id', profile.id)
      setIsLead(profile.role === 'lead')
      const profileRole = profile.role || 'member'
      const profileSecondaryRoles = profile.secondary_roles || []
      setRole(profileRole)
      setSecondaryRoles(profileSecondaryRoles)
      setMustChangePassword(!!profile.must_change_password && !teamMatch)
      // Authority fields
      let tier = profile.authority_tier || 'guest'
      let admin = !!profile.is_authority_admin
      if (isAdmin) {
        admin = true
        tier = 'teammate'
      }
      const roleLabel = profile.primary_role_label || ''
      let tags = profile.function_tags || []
      // Auto-grant Co-Founder tag — persist to DB if missing
      if (isAdmin && !tags.includes('Co-Founder')) {
        tags = [...tags, 'Co-Founder']
        supabase.from('profiles').update({ function_tags: tags }).eq('id', profile.id).then()
      }

      const bio = profile.short_bio || ''
      setAuthorityTier(tier)
      setIsAuthorityAdmin(admin)
      setPrimaryRoleLabel(roleLabel)
      setFunctionTags(tags)
      setShortBio(bio)
      const nick = profile.nickname || ''
      const useNick = !!profile.use_nickname
      setNickname(nick)
      setUseNickname(useNick)
      localStorage.setItem('scrum-username', profile.display_name)
      localStorage.setItem('chat-username', profile.display_name)
      localStorage.setItem('scrum-role', profileRole)
      localStorage.setItem('scrum-secondary-roles', JSON.stringify(profileSecondaryRoles))
      localStorage.setItem('scrum-authority-tier', tier)
      localStorage.setItem('scrum-is-authority-admin', String(admin))
      localStorage.setItem('scrum-primary-role-label', roleLabel)
      localStorage.setItem('scrum-function-tags', JSON.stringify(tags))
      localStorage.setItem('scrum-short-bio', bio)
      localStorage.setItem('scrum-nickname', nick)
      localStorage.setItem('scrum-use-nickname', String(useNick))
    }
  }

  const clearState = () => {
    setUser(null)
    setPasswordRecovery(false)
    setUsername('')
    setIsLead(false)
    setRole('member')
    setSecondaryRoles([])
    setAuthorityTier('guest')
    setIsAuthorityAdmin(false)
    setPrimaryRoleLabel('')
    setFunctionTags([])
    setShortBio('')
    setNickname('')
    setUseNickname(false)
    setIsTeam(false)
    setTeamNumber('')
    localStorage.removeItem('scrum-is-team')
    localStorage.removeItem('scrum-team-number')
    localStorage.removeItem('session-start')
    localStorage.removeItem('scrum-username')
    localStorage.removeItem('chat-username')
    localStorage.removeItem('scrum-role')
    localStorage.removeItem('scrum-secondary-roles')
    localStorage.removeItem('scrum-authority-tier')
    localStorage.removeItem('scrum-is-authority-admin')
    localStorage.removeItem('scrum-primary-role-label')
    localStorage.removeItem('scrum-function-tags')
    localStorage.removeItem('scrum-short-bio')
    localStorage.removeItem('scrum-nickname')
    localStorage.removeItem('scrum-use-nickname')
  }

  const isSessionExpired = () => {
    const start = localStorage.getItem('session-start')
    if (!start) return true
    return Date.now() - parseInt(start, 10) > SESSION_MAX_AGE
  }

  const expireSession = async () => {
    setSessionExpired(true)
    try { await supabase.auth.signOut() } catch (e) { /* ignore */ }
    clearState()
    localStorage.clear()
    sessionStorage.clear()
  }

  // Restore session on mount
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return
        if (session?.user) {
          localStorage.setItem('scrum-user-email', session.user.email || '')
          // A valid session with no session-start just means the bookkeeping key
          // was lost (it's only written on SIGNED_IN). Treat now as the start
          // rather than expiring — otherwise isSessionExpired() returns true and
          // logs the user out on every visit.
          // A reset link is a brand new session too. Without this, a stale
          // session-start left over from a lapsed login expires it on arrival
          // and the user lands back on the landing page.
          if (arrivedFromRecoveryLink || !localStorage.getItem('session-start')) {
            localStorage.setItem('session-start', Date.now().toString())
          }
          if (isSessionExpired()) {
            await expireSession()
            if (mounted) setLoading(false)
            return
          }
          setUser(session.user)
          // Immediately detect team account from email — must happen before any setLoading(false)
          const userEmail = session.user.email?.toLowerCase() || ''
          const teamMatch = userEmail.match(TEAM_EMAIL_REGEX)
          if (teamMatch) {
            setIsTeam(true)
            setTeamNumber(teamMatch[1])
            localStorage.setItem('scrum-is-team', 'true')
            localStorage.setItem('scrum-team-number', teamMatch[1])
          }
          // Load cached profile keyed by user ID for instant render
          const cachedUserId = localStorage.getItem('scrum-cached-user-id')
          if (cachedUserId === session.user.id) {
            const cachedName = localStorage.getItem('scrum-username')
            if (cachedName) {
              setUsername(cachedName)
              const cachedTier = localStorage.getItem('scrum-authority-tier')
              if (cachedTier) setAuthorityTier(cachedTier)
              const cachedTags = localStorage.getItem('scrum-function-tags')
              if (cachedTags) { try { setFunctionTags(JSON.parse(cachedTags)) } catch (e) {} }
              const cachedRole = localStorage.getItem('scrum-role')
              if (cachedRole) { setRole(cachedRole); setIsLead(cachedRole === 'lead') }
              if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
                setIsAuthorityAdmin(true)
                setAuthorityTier('teammate')
                const currentTags = JSON.parse(localStorage.getItem('scrum-function-tags') || '[]')
                if (!currentTags.includes('Co-Founder')) {
                  const newTags = [...currentTags, 'Co-Founder']
                  setFunctionTags(newTags)
                  localStorage.setItem('scrum-function-tags', JSON.stringify(newTags))
                }
                localStorage.setItem('scrum-is-authority-admin', 'true')
                localStorage.setItem('scrum-authority-tier', 'teammate')
              }
              if (mounted) setLoading(false)
            }
          }
          // Always verify against DB
          const profile = await fetchProfile(session.user.id)
          if (mounted) {
            if (profile) {
              applyProfile(profile, session.user.email)
            } else if (await ensureProfile(session.user)) {
              const rebuilt = await fetchProfile(session.user.id)
              if (rebuilt) applyProfile(rebuilt, session.user.email)
            } else if (!cachedUserId || cachedUserId !== session.user.id) {
              console.warn('[Auth] No profile found — forcing re-login')
              await expireSession()
              setLoading(false)
              return
            } else {
              // Profile unreadable but the cache matches this user. Previously we
              // fell through and kept the cached roles, so a stale function_tags
              // could grant access forever. Fail closed instead: no roles until
              // the DB actually answers.
              console.warn('[Auth] Profile unreadable — dropping cached roles')
              setFunctionTags([])
              setAuthorityTier('guest')
              setIsAuthorityAdmin(false)
              localStorage.setItem('scrum-function-tags', '[]')
              localStorage.setItem('scrum-authority-tier', 'guest')
            }
            setupRealtimeSub(session.user.id)
            setupRoleNotifSub(session.user.id)
            setLoading(false)
          }
          return
        }
      } catch (err) {
        console.error('Failed to restore session:', err)
      }
      // The link looked like a reset but no session came of it, so there is
      // nothing to set a password on. Fall back to the normal sign-in path.
      if (mounted) setPasswordRecovery(false)
      if (mounted) setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true)
          if (session?.user) setUser(session.user)
        } else if (event === 'SIGNED_IN' && session?.user) {
          const cachedUserId = localStorage.getItem('scrum-cached-user-id')
          const isSameUser = cachedUserId === session.user.id
          if (!isSameUser) {
            // Different user — clear stale cache from previous account
            localStorage.removeItem('scrum-cached-user-id')
            setAuthorityTier('guest')
            setFunctionTags([])
            setUsername('')
          }
          localStorage.setItem('session-start', Date.now().toString())
          setSessionExpired(false)
          setUser(session.user)
          localStorage.setItem('scrum-user-email', session.user.email || '')
          // Immediately detect team account from email
          const userEmail = session.user.email?.toLowerCase() || ''
          const signInTeamMatch = userEmail.match(TEAM_EMAIL_REGEX)
          if (signInTeamMatch) {
            setIsTeam(true)
            setTeamNumber(signInTeamMatch[1])
            localStorage.setItem('scrum-is-team', 'true')
            localStorage.setItem('scrum-team-number', signInTeamMatch[1])
          }
          // Auto-grant admin for specific emails
          if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
            setIsAuthorityAdmin(true)
            setAuthorityTier('teammate')
            const currentTags = JSON.parse(localStorage.getItem('scrum-function-tags') || '[]')
            if (!currentTags.includes('Co-Founder')) {
              const newTags = [...currentTags, 'Co-Founder']
              setFunctionTags(newTags)
              localStorage.setItem('scrum-function-tags', JSON.stringify(newTags))
            }
            localStorage.setItem('scrum-is-authority-admin', 'true')
            localStorage.setItem('scrum-authority-tier', 'teammate')
          }
          let profile = await fetchProfile(session.user.id)
          if (!profile) {
            // Their account outlived its profile — rebuild rather than dead-end.
            await ensureProfile(session.user)
            profile = await fetchProfile(session.user.id)
          }
          if (mounted) {
            if (profile) {
              applyProfile(profile, session.user.email)
            } else {
              console.error('[Auth] No profile found for user:', session.user.id)
            }
            setupRealtimeSub(session.user.id)
            setupRoleNotifSub(session.user.id)
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Keep user state fresh when token auto-refreshes (e.g. after page idle/refresh)
          setUser(session.user)
        } else if (event === 'SIGNED_OUT') {
          clearState()
        }
      }
    )

    // Periodic 12-hour check (every 60 seconds)
    const interval = setInterval(() => {
      if (localStorage.getItem('session-start') && isSessionExpired()) {
        expireSession()
      }
    }, 60 * 1000)

    // Poll the profile so a role change lands within ~30s even when realtime
    // isn't delivering. Realtime and the focus refresh are still the fast paths;
    // this is the floor that makes access changes actually take effect.
    // Only re-applies when something access-related moved, so it doesn't
    // re-render or rewrite localStorage on every tick.
    let lastAccessKey = null
    const pollProfile = async () => {
      if (!mounted || document.visibilityState !== 'visible') return
      try {
        // Deliberately avoids supabase.auth.getSession(): it takes a web lock
        // shared across tabs, and a frozen duplicate tab can hold it forever —
        // hanging every path that waits on it while looking like nothing.
        // Plain REST with the cached id has no lock to wait on.
        const uid = localStorage.getItem('scrum-cached-user-id')
        if (!uid) return
        const restUrl = import.meta.env.VITE_SUPABASE_URL
        const restKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        const res = await fetch(`${restUrl}/rest/v1/profiles?id=eq.${uid}&select=*`, {
          headers: restHeaders(),
        })
        if (!res.ok || !mounted) return
        const rows = await res.json()
        const profile = Array.isArray(rows) && rows[0] ? rows[0] : null
        if (!profile || !mounted) return
        setProfileSync({ at: Date.now(), source: 'rest', error: '' })
        const key = JSON.stringify([
          profile.function_tags || [],
          profile.authority_tier || '',
          profile.role || '',
          profile.is_authority_admin || false,
        ])
        if (key === lastAccessKey) return
        lastAccessKey = key
        applyProfile(profile, localStorage.getItem('scrum-user-email') || '')
      } catch { /* ignore */ }
    }
    pollProfileRef.current = pollProfile
    const profilePoll = setInterval(pollProfile, 30 * 1000)

    // Re-read the profile whenever the tab regains focus. Realtime below covers
    // the live case, but it only fires if `profiles` is in the supabase_realtime
    // publication — without this, a role removed by a lead can sit stale in an
    // open tab until the next sign-in.
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'visible' || !mounted) return
      pollProfileRef.current?.()
    }
    document.addEventListener('visibilitychange', refreshOnFocus)
    window.addEventListener('focus', refreshOnFocus)

    // Belt-and-braces on top of the profiles subscription below: a role change
    // always writes a 'role_change' notification, and the notifications channel
    // is known to work (it drives the celebration modal). If `profiles` isn't in
    // the supabase_realtime publication, this is what actually clears a removed
    // role from an open tab.
    let roleNotifChannel = null
    const setupRoleNotifSub = (userId) => {
      if (roleNotifChannel) supabase.removeChannel(roleNotifChannel)
      roleNotifChannel = supabase
        .channel(`role-change-${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }, async (payload) => {
          if (!mounted || payload.new?.type !== 'role_change') return
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user && mounted) {
              const profile = await fetchProfile(session.user.id)
              if (mounted && profile) applyProfile(profile, session.user.email)
            }
          } catch { /* ignore */ }
        })
        .subscribe()
    }

    // Realtime subscription: pick up role/tag changes made by leads immediately
    let profileChannel = null
    const setupRealtimeSub = (userId) => {
      if (profileChannel) supabase.removeChannel(profileChannel)
      if (roleNotifChannel) supabase.removeChannel(roleNotifChannel)
      profileChannel = supabase
        .channel(`profile-changes-${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        }, async () => {
          if (!mounted) return
          // Re-fetch profile + session email to avoid stale closure issues
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user && mounted) {
              const profile = await fetchProfile(session.user.id)
              if (mounted && profile) applyProfile(profile, session.user.email)
            }
          } catch (e) { /* ignore */ }
        })
        .subscribe()
    }

    // Detect stale session on tab/laptop wake + re-fetch profile for permission changes
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (localStorage.getItem('session-start') && isSessionExpired()) {
        expireSession()
        return
      }
      // Verify session is still valid with Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session && localStorage.getItem('session-start')) {
          expireSession()
        } else if (session?.user && mounted) {
          // Re-fetch profile to pick up any tier/role changes made by leads
          const profile = await fetchProfile(session.user.id)
          if (mounted && profile) applyProfile(profile, session.user.email)
        }
      } catch (e) {
        // ignore network errors on wake
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Safety fallback — never stay on loading screen forever
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 2000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (profileChannel) supabase.removeChannel(profileChannel)
      clearTimeout(timeout)
      clearInterval(interval)
      clearInterval(profilePoll)
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [])

  // Role-change detection now lives inside applyProfile (which runs on
  // initial load, sign-in, and tab-wake), so no separate poll is needed.

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  const signup = async (email, password, displayName, role = 'member') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error

    // Create profile row
    if (data.user) {
      const PERM_COFOUNDERS = ['yukti', 'kayden']
      const isPermCofounder = PERM_COFOUNDERS.some(n => displayName.toLowerCase().includes(n))

      // Roles a lead assigned to this email before it had an account. They're
      // stored comma-separated in approved_emails.role, so 'member' (the plain
      // default) means "no roles".
      const preAssigned = String(role || '')
        .split(',')
        .map(r => r.trim())
        .filter(r => r && r.toLowerCase() !== 'member')
      const tags = isPermCofounder
        ? [...new Set(['Co-Founder', ...preAssigned])]
        : preAssigned

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        display_name: displayName,
        role: role,
        authority_tier: (isPermCofounder || tags.length > 0) ? 'teammate' : 'guest',
        function_tags: tags,
      })
      if (profileError) {
        console.error('Failed to create profile:', profileError.message)
      }
    }
    return data
  }

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) throw error
  }

  const updatePassword = async (newPassword) => {
    // Go straight at the auth API with the stored access token rather than
    // supabase.auth.updateUser(): the client takes a cross-tab lock that can
    // hang indefinitely, which showed up as "it takes forever and doesn't save".
    let saved = false
    try {
      const ref = url.split('//')[1].split('.')[0]
      const raw = window.localStorage.getItem(`sb-${ref}-auth-token`)
      const token = raw ? JSON.parse(raw)?.access_token : null
      if (token) {
        const res = await fetch(`${url}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: newPassword }),
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(JSON.parse(body || '{}')?.msg || body || 'Could not update password')
        }
        saved = true
      }
    } catch (e) {
      // A real rejection from the API (weak password, expired token) should
      // surface; only fall through to the client if we never got that far.
      if (e?.message && !/fetch|network/i.test(e.message)) throw e
    }

    if (!saved) {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
    }

    // Clear the forced-change flag over plain REST, and CONFIRM it landed.
    // This used to go through the JS client as the authenticated role, which
    // can stall — leaving the user staring at the change-password screen, and
    // if the write never landed the profile poll flipped the flag back on and
    // sent them round again.
    const uid = user?.id || localStorage.getItem('scrum-cached-user-id')
    if (uid) {
      try {
        const res = await fetch(`${url}/rest/v1/profiles?id=eq.${uid}`, {
          method: 'PATCH',
          headers: {
            ...restHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ must_change_password: false }),
        })
        const rows = res.ok ? await res.json() : null
        if (!rows || rows.length === 0) {
          throw new Error("Couldn't save the change — try once more.")
        }
      } catch (e) {
        // Surface it: silently continuing means they bounce back here shortly.
        throw new Error(e.message || 'Could not finish updating your password.')
      }
    }

    setMustChangePassword(false)
    setPasswordRecovery(false)
  }

  // The sign-in is really gone: say so once, rather than every screen
  // quietly coming back empty.
  const [sessionLost, setSessionLost] = useState(false)

  // Keep the sign-in alive while someone is signed in (lib/restHeaders.js).
  // A new sign-in clears any earlier "sign in again".
  useEffect(() => {
    if (!user?.id) return
    setSessionLost(false)
    return startSessionKeeper()
  }, [user?.id])

  useEffect(() => {
    const onLost = () => setSessionLost(true)
    window.addEventListener('scrum-session-lost', onLost)
    return () => window.removeEventListener('scrum-session-lost', onLost)
  }, [])

  const logout = async () => {
    // signOut() can hang if the Supabase auth lock is stuck (e.g. after hard refresh).
    // Give it 3 seconds max, then proceed with local cleanup regardless.
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 500))
      ])
    } catch (e) {
      // sign out even if supabase call fails
    }
    clearState()
    localStorage.clear()
    sessionStorage.clear()
    window.location.replace(window.location.origin)
  }

  return (
    <UserContext.Provider
      value={{ username, nickname, useNickname, chatName: (useNickname && nickname) ? nickname : username, isLead, role, secondaryRoles, authorityTier, isAuthorityAdmin, primaryRoleLabel, functionTags, shortBio, user, loading, login, signup, logout, checkWhitelist, resetPassword, updatePassword, passwordRecovery, mustChangePassword, sessionExpired, sessionLost, roleChangeAlert, dismissRoleChangeAlert: () => setRoleChangeAlert(null), isTeam, isTeamController, teamFullAccess, reportTeamFullAccess: applyTeamFullAccess, teamNumber, profileSync, refreshProfileNow: () => pollProfileRef.current?.() }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within a UserProvider')
  return ctx
}
