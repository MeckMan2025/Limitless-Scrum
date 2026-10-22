import { useState, useEffect } from 'react'
import { onlyMyTeam, storedTeamScope } from '../lib/teamScope'
import { restHeaders } from '../lib/restHeaders'
import { X, Users, CheckCircle, Lock, XCircle, Wrench, Clock, Briefcase, Cpu, ClipboardList, GraduationCap } from 'lucide-react'
import { supabase } from '../supabase'
import NotificationBell from './NotificationBell'
import { usePresenceContext } from '../contexts/PresenceContext'
import OnlineDot from './OnlineDot'
import { BUSINESS_ROLES, TECHNICAL_ROLES, DEPARTMENTS, LEADERSHIP_TAGS, ROLE_DESC } from '../data/orgRoles'

const STATUS_MAP = {
  'available': { label: 'Available', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  'locked-in': { label: 'Locked In', icon: Lock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  'dnd': { label: "Don't Talk To Me", icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  'in-lab': { label: 'In Lab', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
  'out': { label: 'Out', icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50' },
}

const SKILL_LEVEL_COLORS = {
  beginner: 'bg-gray-100 text-gray-600',
  working: 'bg-blue-100 text-blue-700',
  strong: 'bg-green-100 text-green-700',
  expert: 'bg-purple-100 text-purple-700',
}

const TIER_BORDER = { guest: 'border-yellow-300', teammate: 'border-blue-300', top: 'border-pink-400' }
const TIER_BG = { guest: 'bg-yellow-50', teammate: 'bg-blue-50', top: 'bg-pink-50' }

const hasTag = (p, tag) => (p.function_tags || []).some(t => t === tag)

// Pink "top" border = leadership, derived from the actual role tags so every
// leader is highlighted consistently (the authority_tier field is unreliable).
const LEADERSHIP_TAGS_FOR_BORDER = ['Co-Founder', 'Mentor', 'Coach', 'Project Manager', 'Business Lead', 'Technical Lead', 'Programming Lead',
  'Co-Project Manager', 'Co-Business Lead', 'Co-Technical Lead', 'Co-Programming Lead']
function deriveTier(p) {
  const tags = p.function_tags || []
  if (tags.some(t => LEADERSHIP_TAGS_FOR_BORDER.includes(t))) return 'top'
  if (p.role === 'guest' || tags.includes('Guest')) return 'guest'
  return 'teammate'
}

// ── Color themes: orange = Business, blue = Hardware, green = Software ──
const THEME = {
  orange: {
    box: 'bg-orange-50 border-orange-300', title: 'text-orange-700',
    mini: 'border-orange-300 bg-white/70', miniLabel: 'text-orange-700',
    chip: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
    leadChip: 'bg-orange-500 text-white hover:bg-orange-600',
    tile: 'bg-white border-2 border-orange-200 text-orange-900 shadow-sm hover:border-orange-400 hover:shadow-md',
    leadTile: 'bg-orange-100 border-2 border-orange-500 text-orange-900 shadow-sm hover:bg-orange-200 hover:shadow-md',
    photoRing: 'ring-2 ring-orange-200',
  },
  blue: {
    box: 'bg-blue-50 border-blue-300', title: 'text-blue-700',
    mini: 'border-blue-300 bg-white/70', miniLabel: 'text-blue-700',
    chip: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    leadChip: 'bg-blue-500 text-white hover:bg-blue-600',
    tile: 'bg-white border-2 border-blue-200 text-blue-900 shadow-sm hover:border-blue-400 hover:shadow-md',
    leadTile: 'bg-blue-100 border-2 border-blue-500 text-blue-900 shadow-sm hover:bg-blue-200 hover:shadow-md',
    photoRing: 'ring-2 ring-blue-200',
  },
  green: {
    box: 'bg-green-50 border-green-300', title: 'text-green-700',
    mini: 'border-green-300 bg-white/70', miniLabel: 'text-green-700',
    chip: 'bg-green-100 text-green-800 hover:bg-green-200',
    leadChip: 'bg-green-500 text-white hover:bg-green-600',
    tile: 'bg-white border-2 border-green-200 text-green-900 shadow-sm hover:border-green-400 hover:shadow-md',
    leadTile: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-sm hover:bg-green-200 hover:shadow-md',
    photoRing: 'ring-2 ring-green-200',
  },
}

// Shared "___ Lead:" line
function LeadLine({ label, leads, coLeads = [], theme, onClick }) {
  // Lead and co-lead sit side by side as equals — the only difference is the
  // small "co-lead" caption under the tile.
  const all = [
    ...leads.map(p => ({ p, co: false })),
    ...coLeads.map(p => ({ p, co: true })),
  ]
  return (
    <div className="flex flex-col items-center gap-1 mb-4">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label} Lead</span>
      {all.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1">
          {all.map(({ p, co }) => (
            <div key={p.id} className="w-[76px] flex flex-col items-center">
              <PersonTile profile={p} onClick={onClick} theme={theme} lead />
              {co && <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">co-lead</span>}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-sm italic text-gray-300">Unassigned</span>
      )}
    </div>
  )
}

// ── Square tile: profile picture on top, name underneath ──
function PersonTile({ profile, onClick, theme, lead = false }) {
  const { isOnline } = usePresenceContext()
  const name = profile.display_name || 'Unknown'
  return (
    <button
      onClick={() => onClick(profile)}
      title={`View ${name}'s profile`}
      className={`flex flex-col items-center gap-1.5 w-full max-w-[76px] px-1.5 pt-2 pb-1.5 rounded-xl transition-all
        hover:scale-105 active:scale-95 ${lead ? theme.leadTile : theme.tile}`}
    >
      <div className="relative">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className={`w-12 h-12 rounded-lg object-cover ${theme.photoRing}`} />
        ) : (
          <div className={`w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center text-base font-bold text-gray-400 ${theme.photoRing}`}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="absolute -bottom-0.5 -right-0.5">
          <OnlineDot online={isOnline(name)} size={11} />
        </span>
      </div>
      <span className="text-[10px] font-semibold leading-[1.15] text-center w-full break-words hyphens-auto">
        {name}
      </span>
    </button>
  )
}

// ── Role mini-box with hover tooltip ──
function RoleBox({ role, people, theme, onClick }) {
  return (
    <div className={`group relative rounded-lg border-2 p-2.5 ${theme.mini}`}>
      <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 text-center ${theme.miniLabel}`}>{role.tag}</p>
      {people.length > 0 ? (
        <div
          className="grid gap-1.5 justify-items-center"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' }}
        >
          {people.map(p => <PersonTile key={p.id} profile={p} onClick={onClick} theme={theme} />)}
        </div>
      ) : (
        <p className="text-xs italic text-gray-300 text-center">Unassigned</p>
      )}
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 z-20
        opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-gray-800 text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-lg text-center">
          {role.desc}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 rotate-45 -mt-1" />
        </div>
      </div>
    </div>
  )
}

// ── Business department (single orange box, flat roles) ──
const DEPT_ICON = { business: Briefcase, hardware: Wrench, software: Cpu }

// ── One department box. Business, Hardware and Software are peers: each owns
// its own lead, and none of them sits under another. ──
function Department({ dept, leads, coLeads, membersByTag, onClick }) {
  const theme = THEME[dept.color] || THEME.blue
  const Icon = DEPT_ICON[dept.key] || Cpu
  return (
    <div className={`h-full flex flex-col rounded-2xl border-2 shadow-sm p-4 ${theme.box}`}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <Icon size={20} className={theme.title} />
        <h2 className={`text-lg font-black ${theme.title}`}>{dept.label}</h2>
      </div>
      <LeadLine label={dept.label} leads={leads} coLeads={coLeads} theme={theme} onClick={onClick} />
      <div className="grid grid-cols-1 gap-2.5 flex-1">
        {dept.roles.map(role => (
          <RoleBox key={role.tag} role={role} people={membersByTag(role.tag)} theme={theme} onClick={onClick} />
        ))}
      </div>
    </div>
  )
}

// ── Person Card (leadership sections) ──
function PersonCard({ profile, onClick }) {
  const tier = deriveTier(profile)
  const primaryTag = (profile.function_tags || [])[0]
  const { isOnline } = usePresenceContext()
  return (
    <button
      onClick={() => onClick(profile)}
      title={ROLE_DESC[primaryTag] || 'View profile'}
      className={`flex flex-col items-center px-4 py-3 rounded-xl border-2 shadow-sm bg-white/80 backdrop-blur-sm
        hover:shadow-md hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer min-w-[120px] max-w-[160px]
        ${TIER_BORDER[tier] || 'border-gray-200'}`}
    >
      <div className="relative mb-1.5">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 ${TIER_BG[tier] || 'bg-gray-100'}`}>
            {(profile.display_name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <span className="absolute -bottom-0.5 -right-0.5">
          <OnlineDot online={isOnline(profile.display_name)} size={12} />
        </span>
      </div>
      <span className="text-sm font-semibold text-gray-800 text-center leading-tight truncate w-full">
        {profile.display_name || 'Unknown'}
      </span>
      {profile.primary_role_label && (
        <span className="text-[11px] text-gray-400 mt-0.5 text-center leading-tight truncate w-full">
          {profile.primary_role_label}
        </span>
      )}
    </button>
  )
}

// ── Profile Detail Modal (unchanged) ──
function LeaderSection({ title, icon: Icon, people, onClick, accent }) {
  if (!people.length) return null
  return (
    <div className="bg-white/70 rounded-2xl shadow-sm border border-gray-100 p-4 mt-6">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Icon size={18} className={accent} />
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">{title}</h2>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {people.map(p => <PersonCard key={p.id} profile={p} onClick={onClick} />)}
      </div>
    </div>
  )
}

// ── Project Managers — cute rounded box with the ombre gradient ──
function ProjectManagerNote({ people, onClick }) {
  return (
    <div className="flex justify-center mt-6">
      <div
        className="rounded-2xl shadow-sm border border-white/60 p-5 text-center w-full max-w-md"
        style={{ background: 'linear-gradient(140deg, #dbeafe 0%, #fce7f3 55%, #ffedd5 100%)' }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <ClipboardList size={18} className="text-pink-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Project Managers</h2>
        </div>
        {people.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-3">
            {people.map(p => <PersonCard key={p.id} profile={p} onClick={onClick} />)}
          </div>
        ) : (
          <p className="text-xs italic text-gray-500">Unassigned</p>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──
function OrgChart({ onViewProfile }) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const headers = restHeaders()

  useEffect(() => {
    async function fetchProfiles() {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=id,display_name,primary_role_label,function_tags,short_bio,authority_tier,role,avatar_url`,
          { headers }
        )
        if (res.ok) {
          const rows = await res.json()
          // Guests aren't team members — keep them off the org chart.
          setProfiles(rows.filter(r => deriveTier(r) !== 'guest'))
        }
      } catch (e) { console.error('Failed to load org chart:', e) }
      setLoading(false)
    }
    fetchProfiles()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('org-chart-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onlyMyTeam((payload) => {
        if (payload.eventType === 'INSERT') {
          if (deriveTier(payload.new) !== 'guest') {
            setProfiles(prev => prev.some(p => p.id === payload.new.id) ? prev : [...prev, payload.new])
          }
        } else if (payload.eventType === 'UPDATE') {
          setProfiles(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p))
        } else if (payload.eventType === 'DELETE') {
          setProfiles(prev => prev.filter(p => p.id !== payload.old.id))
        }
      }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const membersByTag = (tag) => profiles.filter(p => hasTag(p, tag))

  // Include any custom role tags that aren't in the catalog or leadership set
  const catalogTags = new Set([...BUSINESS_ROLES, ...TECHNICAL_ROLES].map(r => r.tag))
  // Tags that are settings, not jobs. FullAccess marks a team that runs the
  // whole app and Team marks a shared login; neither is something a person
  // does, and the org chart showing "FullAccess" as a department was just this
  // list sweeping up every unfamiliar tag.
  const NOT_A_ROLE = new Set(['Team', 'FullAccess', 'Guest'])
  const extraTags = [...new Set(profiles.flatMap(p => p.function_tags || []))]
    .filter(t => !LEADERSHIP_TAGS.has(t) && !catalogTags.has(t) && !NOT_A_ROLE.has(t))
  const extraTech = extraTags.map(t => ({ tag: t, desc: ROLE_DESC[t] || 'Custom team role.' }))

  // Custom (non-catalog) role tags get appended to the last department (Software).
  const departments = DEPARTMENTS.map((d, i) =>
    i === DEPARTMENTS.length - 1 && extraTech.length
      ? { ...d, roles: [...d.roles, ...extraTech] }
      : d
  )
  const projectManagers = profiles.filter(p => hasTag(p, 'Project Manager') || hasTag(p, 'Team Lead') || hasTag(p, 'Co-Project Manager'))
  const mentorsCoaches = profiles.filter(p => hasTag(p, 'Mentor') || hasTag(p, 'Coach'))

  // Straight to the full profile. The popup that used to open here was a
  // summary with a "View profile" button underneath it — a stop on the way to
  // the page that actually holds their attendance, tasks and notebook.
  const handleCardClick = (profile) => {
    if (profile?.id) onViewProfile?.(profile.id)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
        <div className="px-4 py-4 pl-14 flex items-center justify-between text-gray-200">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent flex items-center gap-2">
              <Users size={22} className="text-brand-yellow-dark" />
              Org Chart
            </h1>
            <p className="text-sm text-gray-300">Hover a role for its description · tap a name to view the profile</p>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20"><div className="text-sm text-gray-400">Loading team...</div></div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <Users size={48} className="mb-3 opacity-40" />
              <p className="text-sm">No team members found</p>
            </div>
          ) : (
            <>
              {/* Three equal departments: Business (orange) · Hardware (blue) · Software (green) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                {departments.map(dept => (
                  <Department
                    key={dept.key}
                    dept={dept}
                    leads={profiles.filter(p => hasTag(p, dept.leadTag))}
                    coLeads={profiles.filter(p => hasTag(p, dept.coLeadTag))}
                    membersByTag={membersByTag}
                    onClick={handleCardClick}
                  />
                ))}
              </div>

              {/* Project Managers — ombre sticky note, its own box */}
              <ProjectManagerNote people={projectManagers} onClick={handleCardClick} />

              {/* Mentors & Coaches */}
              <LeaderSection title="Mentors & Coaches" icon={GraduationCap} people={mentorsCoaches} onClick={handleCardClick} accent="text-purple-500" />
            </>
          )}
        </div>
      </main>

    </div>
  )
}

export default OrgChart
