import { useState, useEffect } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { ScrollText, Plus, FolderKanban, Trash2, Menu, X, ClipboardList, ChevronRight, LineChart, MoreVertical, Settings, User, LogOut, Bell, GitBranch, HelpCircle, ClipboardEdit, Play, Pause, Calendar, Shield, Home, Gamepad2, MessageCircle, GraduationCap, Lightbulb, Megaphone, Briefcase, Wallet, TrendingUp, History, Receipt, PenTool, Globe, Sparkles, Ruler, Hammer, Wrench, Zap, FlaskConical, Code, Cable, Bug as BugIcon, UserCog, LayoutGrid, Scale, Construction } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { useToast } from './ToastProvider'
import { notifyRequestReviewers } from '../utils/requestRouting'

// liveDay: the Competition Day that is live, or null. While one is live the
// nav is three things — Home (the board), Scouting, and Special Controls for
// whoever already has it — and nothing else, so the day is all there is.
function Sidebar({ tabs, activeTab, onTabChange, onAddTab, isOpen, onToggle, isPlaying, onToggleMusic, musicStarted, onlineUsers, isTeamAccount, compDayLock, liveDay = null }) {
  const { logout, username, user } = useUser()
  const { canManageOwnTeam, teamFullAccess, isGuest, canEditContent, canRequestContent, hasLeadTag, isCofounder, canViewSpecialControls, canViewOutreachTabs, canViewFinanceTabs, canViewCommsTabs, canViewHardwareTabs, canViewSoftwareTabs } = usePermissions()
  const { addToast } = useToast()
  const [newTabName, setNewTabName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Boards used to open by default for a visiting team, from when boards were
  // all they had. They have a dashboard now, and a sidebar that opens onto a
  // board list argues with it.
  const [boardsOpen, setBoardsOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [navFilter, setNavFilter] = useState(() => localStorage.getItem('scrum-nav-filter') || 'general')
  // Nav mode: 'role' = just your role/division tabs, 'general' = the general app, 'all' = everything.
  const [navModeRaw, setNavMode] = useState(() => localStorage.getItem('scrum-nav-mode') || 'all')
  // Live site always behaves as 'all'; the switcher is local-only for now.
  const navMode = import.meta.env.DEV ? navModeRaw : 'all'

  // Reset all dropdowns when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setMenuOpen(false)
      setBoardsOpen(false)
      setDataOpen(false)
      setCalendarOpen(false)
      setChatOpen(false)
      setIsAdding(false)
      setNewTabName('')
    }
  }, [isOpen])

  const handleAddTab = (e) => {
    e.preventDefault()
    if (!newTabName.trim()) return
    if (localStorage.getItem('scrum-sfx-enabled') !== 'false') new Audio('/sounds/click.mp3').play().catch(() => {})
    onAddTab(newTabName.trim())
    setNewTabName('')
    setIsAdding(false)
  }

  const handleRequestBoard = async (e) => {
    e.preventDefault()
    if (!newTabName.trim()) return
    const request = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      type: 'board',
      data: { name: newTabName.trim() },
      requested_by: username,
      requested_by_user_id: user?.id,
      status: 'pending',
    }
    setNewTabName('')
    setIsAdding(false)
    addToast('Board request submitted for approval', 'success')
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${supabaseUrl}/rest/v1/requests`, {
      method: 'POST',
      headers: {
        ...restHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }).catch(err => console.error('Failed to request board:', err))
    notifyRequestReviewers(request)
  }

  // Comp Day screen lock — determine which tabs are allowed per role
  const compDayAllowedTabs = compDayLock ? ({
    'scouting': ['comp-day', 'scouting', 'schedule', 'data'],
    'drive-team': ['comp-day', 'chat-all', 'chat-alliances', 'chat-leagues', 'schedule'],
    'pit-crew': ['comp-day', 'schedule'],
    'spirit': ['comp-day', 'schedule'],
    'bag-watch': ['comp-day', 'schedule'],
    'break': ['comp-day', 'schedule'],
    'strategy': ['comp-day', 'data', 'chat-all', 'chat-alliances', 'chat-leagues', 'schedule'],
    'safety': ['comp-day', 'schedule'],
  }[compDayLock.role] || ['comp-day']) : null

  const systemTabs = tabs.filter(t => t.type === 'scouting' || t.type === 'boards')
  const boardTabs = tabs.filter(t => t.type !== 'home' && t.type !== 'scouting' && t.type !== 'boards' && t.type !== 'data' && t.type !== 'ai-manual' && t.type !== 'tasks' && t.type !== 'notebook' && t.type !== 'org-chart' && t.type !== 'suggestions' && t.type !== 'calendar' && t.type !== 'attendance' && t.type !== 'logs' && t.type !== 'user-management' && t.type !== 'schedule' && t.type !== 'workshops' && t.type !== 'special-controls' && t.type !== 'team-scouting-data')
  const isBoardActive = activeTab !== 'home' && activeTab !== 'scouting' && activeTab !== 'boards' && activeTab !== 'data' && activeTab !== 'ai-manual' && activeTab !== 'tasks' && activeTab !== 'notebook' && activeTab !== 'org-chart' && activeTab !== 'suggestions' && activeTab !== 'calendar' && activeTab !== 'timeline' && activeTab !== 'attendance' && activeTab !== 'team-growth' && !activeTab.startsWith('logs') && activeTab !== 'user-management' && activeTab !== 'profile' && activeTab !== 'requests' && activeTab !== 'schedule' && activeTab !== 'workshops' && activeTab !== 'special-controls' && activeTab !== 'chat-all' && activeTab !== 'chat-alliances' && activeTab !== 'chat-leagues' && activeTab !== 'team-scouting-data' && activeTab !== 'role-spec' && activeTab !== 'log-reach' && activeTab !== 'portfolio' && activeTab !== 'budget-tracker' && activeTab !== 'fundraising' && activeTab !== 'financial-history' && activeTab !== 'expense-requests' && activeTab !== 'comms-announcements' && activeTab !== 'content-studio' && activeTab !== 'website-manager' && activeTab !== 'marketing' && activeTab !== 'hw-design' && activeTab !== 'hw-fabrication' && activeTab !== 'hw-assembly' && activeTab !== 'hw-electrical' && activeTab !== 'testing' && activeTab !== 'design-matrix' && activeTab !== 'sw-design' && activeTab !== 'sw-programming' && activeTab !== 'sw-io' && activeTab !== 'bug-tracker'

  return (
    <>
      {/* Toggle button - visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white/90 backdrop-blur-sm shadow-lg z-40 transform transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <button onClick={onToggle} className="p-1 rounded hover:bg-gray-100 transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
              <FolderKanban className="text-brand-yellow-dark" size={20} />
              Navigation
            </span>
            <button onClick={() => setMenuOpen(true)} className="p-1 rounded hover:bg-gray-100 transition-colors">
              <MoreVertical size={18} className="text-gray-400" />
            </button>
          </h2>
        </div>

        {/* Menu Modal */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 bg-black/30 z-50" />
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-xl shadow-xl p-6 w-64 pointer-events-auto relative">
                <button onClick={() => setMenuOpen(false)} className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100 transition-colors">
                  <X size={16} className="text-gray-400" />
                </button>
                <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wide">Menu</h3>
                <div className="space-y-1">
                  {[
                    { icon: User, label: 'Profile', color: 'text-brand-blue-dark', tab: 'profile' },
                    { icon: Settings, label: 'Settings', color: 'text-brand-silver-dark', tab: 'settings' },
                    ...(!isGuest && (!isTeamAccount || teamFullAccess) ? [{ icon: GitBranch, label: 'Org Chart', color: 'text-brand-blue-dark', tab: 'org-chart' }] : []),
                    // A visiting team's controller gets it too, scoped to
                    // their own roster — that is what the account is for.
                    ...(!isGuest && ((!isTeamAccount || teamFullAccess) || canManageOwnTeam) ? [{ icon: Shield, label: 'User Management', color: 'text-brand-yellow-dark', tab: 'user-management' }] : []),
                    { icon: Lightbulb, label: 'Suggestions', color: 'text-brand-silver-dark', tab: 'suggestions' },
                    // Local-only, like RoleSpec and Team Pulse — half-built pages
                    // shouldn't be one tap away on the deployed site.
                    ...(isCofounder && import.meta.env.DEV ? [{ icon: Construction, label: 'Unfinished Tabs', color: 'text-gray-400', tab: 'unfinished-tabs' }] : []),
                    { icon: LogOut, label: 'Logout', color: 'text-red-400' },
                  ].map(({ icon: Icon, label, color, tab, action }) => (
                    <button
                      key={label}
                      onClick={() => {
                        if (label === 'Logout') {
                          logout()
                          return
                        }
                        setMenuOpen(false)
                        if (tab) {
                          onTabChange(tab)
                          onToggle()
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-blue/20 transition-colors text-gray-700 text-sm"
                    >
                      <Icon size={18} className={color} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        <nav className="px-2 pt-1 pb-2 flex-1 overflow-y-auto">
          {/* ─── Live Competition Day Nav ─── */}
          {liveDay ? (<>
            <div className="mb-2 px-2 py-2 bg-gradient-to-r from-green-50 to-emerald-100 rounded-lg border border-green-200">
              <p className="text-xs font-bold text-green-800 text-center flex items-center justify-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Competition Day
              </p>
              <p className="text-[10px] text-green-700 text-center mt-0.5 truncate">{liveDay.name || 'Live now'}</p>
            </div>
            <hr className="my-2 border-gray-200" />
            {/* Home Tab */}
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeTab === 'home' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
              }`}
              onClick={() => { onTabChange('home'); onToggle() }}
            >
              <Home size={16} className="text-brand-yellow-dark" />
              <span className="truncate">Home</span>
            </div>

            <hr className="my-2 border-gray-200" />

            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeTab === 'scouting' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
              }`}
              onClick={() => { onTabChange('scouting'); onToggle() }}
            >
              <ClipboardList size={16} className="text-brand-silver-dark" />
              <span className="truncate">Scouting</span>
            </div>

            {canViewSpecialControls && (
              <>
                <hr className="my-2 border-gray-200" />
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    activeTab === 'special-controls' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
                  }`}
                  onClick={() => { onTabChange('special-controls'); onToggle() }}
                >
                  <Gamepad2 size={16} className="text-brand-yellow-dark" />
                  <span className="truncate">Special Controls</span>
                </div>
              </>
            )}

            <hr className="my-2 border-gray-200" />
          </>) : compDayAllowedTabs ? (<>
          {/* ─── Comp Day Locked Nav ─── */}
            <div className="mb-2 px-2 py-2 bg-gradient-to-r from-red-100 to-orange-100 rounded-lg border border-red-200">
              <p className="text-xs font-bold text-red-700 text-center">🔒 Comp Day Active</p>
              <p className="text-[10px] text-red-500 text-center mt-0.5">Screen locked to your assigned role</p>
            </div>
            <hr className="my-2 border-gray-200" />
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeTab === 'comp-day' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
              }`}
              onClick={() => { onTabChange('comp-day'); onToggle() }}
            >
              <Shield size={16} className="text-red-500" />
              <span className="truncate">Competition Day</span>
            </div>
            <hr className="my-2 border-gray-200" />

            {/* Role-specific tabs based on allowed tabs */}
            {compDayAllowedTabs.includes('scouting') && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'scouting' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => { onTabChange('scouting'); onToggle() }}
              >
                <ClipboardList size={16} className="text-brand-silver-dark" />
                <span className="truncate">Scouting Form</span>
              </div>
            )}
            {compDayAllowedTabs.includes('schedule') && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'schedule' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => { onTabChange('schedule'); onToggle() }}
              >
                <Calendar size={16} className="text-brand-blue-dark" />
                <span className="truncate">Match Schedule</span>
              </div>
            )}
            {compDayAllowedTabs.includes('data') && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'data' ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => { onTabChange('data'); onToggle() }}
              >
                <LineChart size={16} className="text-brand-blue-dark" />
                <span className="truncate">Scouting Data</span>
              </div>
            )}
            {isCofounder && compDayAllowedTabs.includes('chat-all') && (<>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'chat-all' || activeTab === 'chat-alliances' || activeTab === 'chat-leagues'
                    ? 'bg-brand-yellow text-gray-800' : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => setChatOpen(prev => !prev)}
              >
                <MessageCircle size={16} className="text-brand-yellow-dark" />
                <span className="truncate flex-1">Strategy Chat</span>
                <ChevronRight size={14} className={`transition-transform ${chatOpen ? 'rotate-90' : ''}`} />
              </div>
              {chatOpen && (
                <div className="ml-4 mt-1 space-y-1">
                  {[{ tab: 'chat-all', label: 'All' }, { tab: 'chat-alliances', label: 'Alliances' }, { tab: 'chat-leagues', label: 'Leagues' }].map(({ tab, label }) => (
                    <div
                      key={tab}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                        activeTab === tab ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                      }`}
                      onClick={() => { onTabChange(tab); onToggle() }}
                    >
                      <ChevronRight size={14} className={activeTab === tab ? 'rotate-90' : ''} />
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>)}
          </>) : (<>
          {/* ─── Normal Nav ─── */}
          {/* No rule here — the sidebar header already has a border-b, and the two
              together read as a double line above Home. */}
          {/* Role / Gen / All — filters which nav sections show below.
              Local-only while the role experiences are unfinished. */}
          {import.meta.env.DEV && (!isTeamAccount || teamFullAccess) && (
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-xl p-1">
              {[
                { id: 'role', label: 'Role', Icon: UserCog },
                { id: 'general', label: 'Gen', Icon: Home },
                { id: 'all', label: 'All', Icon: LayoutGrid },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setNavMode(id); localStorage.setItem('scrum-nav-mode', id) }}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                    navModeRaw === id ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          )}
          {import.meta.env.DEV && (!isTeamAccount || teamFullAccess) && <hr className="mb-1.5 border-gray-200" />}

          {/* Home Tab */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              activeTab === 'home'
                ? 'bg-brand-yellow text-gray-800'
                : 'hover:bg-brand-blue/30 text-gray-600'
            }`}
            onClick={() => {
              onTabChange('home')
              onToggle()
            }}
          >
            <Home size={16} className="text-brand-yellow-dark" />
            <span className="truncate">Home</span>
          </div>

          {navMode !== 'role' && (<>
          {/* Chat has no nav tab. */}

          <hr className="my-2 border-gray-200" />

          {/* Scouting Tab for team accounts — form only, no dropdown */}

          {/* Scouting sits with the other unfinished tabs for now. The kiosk
              (team accounts) and Comp Day still reach the form above. */}
          {/* Data Tab for team accounts — dropdown with scouting data only */}

          {(!isTeamAccount || teamFullAccess) && <>
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              activeTab === 'data' || activeTab === 'attendance' || activeTab === 'team-growth' || activeTab === 'role-spec'
                ? 'bg-brand-yellow text-gray-800'
                : 'hover:bg-brand-blue/30 text-gray-600'
            }`}
            onClick={() => {
              if (isGuest) {
                onTabChange('data')
                onToggle()
              } else {
                setDataOpen(prev => !prev)
              }
            }}
          >
            <LineChart size={16} className="text-brand-blue-dark" />
            <span className="truncate flex-1">Data</span>
            {!isGuest && (
              <ChevronRight
                size={14}
                className={`transition-transform ${dataOpen || activeTab === 'data' || activeTab === 'attendance' || activeTab === 'team-growth' || activeTab === 'role-spec' ? 'rotate-90' : ''}`}
              />
            )}
          </div>

          {!isGuest && (dataOpen || activeTab === 'data' || activeTab === 'attendance' || activeTab === 'team-growth' || activeTab === 'role-spec') && (
            <div className="ml-4 mt-1 space-y-1">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                  activeTab === 'data' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                }`}
                onClick={() => {
                  onTabChange('data')
                  onToggle()
                }}
              >
                <ChevronRight size={14} className={activeTab === 'data' ? 'rotate-90' : ''} />
                <span className="truncate">RadRank</span>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                  activeTab === 'attendance' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                }`}
                onClick={() => {
                  onTabChange('attendance')
                  onToggle()
                }}
              >
                <ChevronRight size={14} className={activeTab === 'attendance' ? 'rotate-90' : ''} />
                <span className="truncate">Attendance</span>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                  activeTab === 'team-growth' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                }`}
                onClick={() => { onTabChange('team-growth'); onToggle() }}
              >
                <ChevronRight size={14} className={activeTab === 'team-growth' ? 'rotate-90' : ''} />
                <span className="truncate">Team Growth</span>
              </div>
              {/* RoleSpec is local-only for now — import.meta.env.DEV is false
                  in a production build, so it isn't on the deployed site. */}
              {import.meta.env.DEV && (
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                    activeTab === 'role-spec' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                  }`}
                  onClick={() => { onTabChange('role-spec'); onToggle() }}
                >
                  <ChevronRight size={14} className={activeTab === 'role-spec' ? 'rotate-90' : ''} />
                  <span className="truncate">RoleSpec</span>
                </div>
              )}
            </div>
          )}

          </>}

          {/* Only show separator if non-team Data section was rendered (team Data has its own hr) */}
          {(!isTeamAccount || teamFullAccess) && <hr className="my-2 border-gray-200" />}

          {/* Just the Calendar now — a section that holds one page is a
              folder with one file in it. Open to visiting teams too. */}
          {(
            <>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'calendar'
                    ? 'bg-brand-yellow text-gray-800'
                    : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => { onTabChange('calendar'); onToggle() }}
              >
                <Calendar size={16} className="text-brand-yellow-dark" />
                <span className="truncate flex-1">Calendar</span>
              </div>

              <hr className="my-2 border-gray-200" />
            </>
          )}

          {/* Scouting. Its only link used to be inside the Competition Day
              block, which meant it did not exist on an ordinary day — and a
              form nobody can reach does not get filled in. */}
          {!isGuest && (!isTeamAccount || teamFullAccess) && (
            <>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'scouting'
                    ? 'bg-brand-yellow text-gray-800'
                    : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => { onTabChange('scouting'); onToggle() }}
              >
                <ClipboardList size={16} className="text-brand-silver-dark" />
                <span className="truncate">Scouting</span>
              </div>
              <hr className="my-2 border-gray-200" />
            </>
          )}

          {/* The Engineering Notebook is reached from Home and from the
              gallery, not from here.

              Logs is ours — a visiting team has no outreach, expenses or
              mentor log here, and the access rule already refuses it, so the
              link was one that could only ever bounce. */}
          {!isGuest && (!isTeamAccount || teamFullAccess) && (
            <>
              {/* Logs holds three, so it opens rather than being one page —
                  the same as Data. Open it by the arrow; it also opens itself
                  when you're already on one of its pages. */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'logs-outreach' || activeTab === 'logs-expenses' || activeTab === 'logs-mentor'
                    ? 'bg-brand-yellow text-gray-800'
                    : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => setLogsOpen(prev => !prev)}
              >
                <ScrollText size={16} className="text-brand-blue-dark" />
                <span className="truncate flex-1">Logs</span>
                <ChevronRight
                  size={14}
                  className={`transition-transform ${logsOpen || activeTab === 'logs-outreach' || activeTab === 'logs-expenses' || activeTab === 'logs-mentor' ? 'rotate-90' : ''}`}
                />
              </div>

              {(logsOpen || activeTab === 'logs-outreach' || activeTab === 'logs-expenses' || activeTab === 'logs-mentor') && (
                <div className="ml-4 mt-1 space-y-1">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                      activeTab === 'logs-outreach' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                    }`}
                    onClick={() => { onTabChange('logs-outreach'); onToggle() }}
                  >
                    <ChevronRight size={14} className={activeTab === 'logs-outreach' ? 'rotate-90' : ''} />
                    <span className="truncate">Outreach</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                      activeTab === 'logs-expenses' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                    }`}
                    onClick={() => { onTabChange('logs-expenses'); onToggle() }}
                  >
                    <ChevronRight size={14} className={activeTab === 'logs-expenses' ? 'rotate-90' : ''} />
                    <span className="truncate">Expenses</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                      activeTab === 'logs-mentor' ? 'bg-brand-blue/40 text-gray-800' : 'hover:bg-brand-blue/20 text-gray-500'
                    }`}
                    onClick={() => { onTabChange('logs-mentor'); onToggle() }}
                  >
                    <ChevronRight size={14} className={activeTab === 'logs-mentor' ? 'rotate-90' : ''} />
                    <span className="truncate">Mentor</span>
                  </div>
                </div>
              )}

              <hr className="my-2 border-gray-200" />
            </>
          )}

          {/* Boards Tab */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isBoardActive
                ? 'bg-brand-yellow text-gray-800'
                : 'hover:bg-brand-blue/30 text-gray-600'
            }`}
            onClick={() => {
              setBoardsOpen(prev => !prev)
            }}
          >
            <FolderKanban size={16} className="text-brand-blue-dark" />
            <span className="truncate flex-1">Boards</span>
            <ChevronRight
              size={14}
              className={`transition-transform ${boardsOpen || isBoardActive ? 'rotate-90' : ''}`}
            />
          </div>

          {/* Sub-boards */}
          {(boardsOpen || isBoardActive) && <div className="ml-4 mt-1 space-y-1">
            {boardTabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                  activeTab === tab.id
                    ? 'bg-brand-blue/40 text-gray-800'
                    : 'hover:bg-brand-blue/20 text-gray-500'
                }`}
                onClick={() => {
                  onTabChange(tab.id)
                  onToggle()
                }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${activeTab === tab.id ? 'rotate-90' : ''}`}
                  />
                  <span className="truncate">{tab.name}</span>
                </div>
              </div>
            ))}

            {/* Add/Request Board button — hidden for guests */}
            {(canEditContent || canRequestContent) && <div className="pt-1">
              {isAdding ? (
                <form onSubmit={canEditContent ? handleAddTab : handleRequestBoard} className="space-y-2 px-2">
                  <input
                    type="text"
                    value={newTabName}
                    onChange={(e) => setNewTabName(e.target.value)}
                    placeholder="Board name"
                    className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false)
                        setNewTabName('')
                      }}
                      className="flex-1 px-3 py-1 text-xs border rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-3 py-1 text-xs bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg"
                    >
                      {canEditContent ? 'Create' : 'Request'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsAdding(true)}
                  className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-brand-blue/30 hover:bg-brand-blue/50 rounded-lg transition-colors text-gray-500 text-sm"
                >
                  <Plus size={14} />
                  {canEditContent ? 'Add Board' : 'Request Board'}
                </button>
              )}
            </div>}
          </div>}

          </>)}

          {(!isTeamAccount || teamFullAccess) && <>
          {navMode !== 'role' && (<>
          <hr className="my-2 border-gray-200" />

          {/* Workshops — flat nav item; the Tasks dropdown (Scrum + Workshops) is gone. */}
          {!isGuest && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeTab === 'workshops'
                  ? 'bg-brand-yellow text-gray-800'
                  : 'hover:bg-brand-blue/30 text-gray-600'
              }`}
              onClick={() => { onTabChange('workshops'); onToggle() }}
            >
              <ClipboardEdit size={16} className="text-brand-silver-dark" />
              <span className="truncate">Workshops</span>
            </div>
          )}
          </>)}

          {navMode !== 'role' && (<>
          </>)}

          </>}

          {/* Engineering Notebook is not a nav tab — it's reached from the
              gallery button on Home, so everyone gets to it the same way. */}

          {(!isTeamAccount || teamFullAccess) && navMode !== 'role' && <>

          {/* Requests is not a nav item — it's the row under the notification
              bell, so there's one way in for everyone. */}

          {canViewSpecialControls && (
            <>
              <hr className="my-2 border-gray-200" />

              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeTab === 'special-controls'
                    ? 'bg-brand-yellow text-gray-800'
                    : 'hover:bg-brand-blue/30 text-gray-600'
                }`}
                onClick={() => {
                  onTabChange('special-controls')
                  onToggle()
                }}
              >
                <Gamepad2 size={16} className="text-brand-yellow-dark" />
                <span className="truncate">Special Controls</span>
              </div>

              <hr className="my-2 border-gray-200" />
            </>
          )}
          </>}

          {/* In-the-works role tabs always sit at the BOTTOM of the nav. */}
          {(!isTeamAccount || teamFullAccess) && (<>
          {navMode !== 'general' && (<>
          {/* Unfinished role tabs live under Special Controls until they're ready. */}
          </>)}
          </>)}
          </>)}
        </nav>

        {/* Online Now */}
        {onlineUsers && onlineUsers.length > 0 && (
          <div className="px-4 py-3 border-t">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Online Now</h3>
            <div className="space-y-1.5">
              {onlineUsers.map((user) => (
                <div key={user.username} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <span className="truncate">{user.username}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Music control */}
        {musicStarted && (
          <div className="p-4 border-t">
            <button
              onClick={onToggleMusic}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-blue/30 hover:bg-brand-blue/50 rounded-lg transition-colors text-gray-600 text-sm"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {isPlaying ? 'Pause Music' : 'Play Music'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

export default Sidebar
