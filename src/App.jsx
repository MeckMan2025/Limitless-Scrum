import { useState, useEffect, useCallback, useRef } from 'react'
import { completionFields, daysLate, latenessLabel, prettyDone } from './lib/taskDone'
import { onlyMyTeam, scopeQuery, stampStored, storedTeamScope, teamScope } from './lib/teamScope'
import { lazyHeadersWith, lazyRestHeaders, restHeaders } from './lib/restHeaders'
import { notifyLeadOfCoLeadAction } from './lib/coLeadNotice'
import { isTeamAssignee, teamLabel, boardsForSides, assigneeLabel, SIDES, sidesForTags, EVERYONE, UP_FOR_GRABS } from './lib/taskTeams'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Plus, Download, Upload, ChevronRight, CheckCircle, User, Calendar, Trash2, ArrowLeft } from 'lucide-react'
import { downloadRowsCSV, csvName } from './utils/csvUtils'
import { triggerPush } from './utils/pushHelper'
import { TEAM_TAB_IDS } from './data/teamTabs'
import { HOME_TEAM_NUMBER } from './data/team'
import TaskModal from './components/TaskModal'
import TaskCard from './components/TaskCard'
import TaskDetailModal from './components/TaskDetailModal'
import PersonTasksView from './components/PersonTasksView'
import Sidebar from './components/Sidebar'
import LoadingScreen from './components/LoadingScreen'
import ForcePasswordChange from './components/ForcePasswordChange'
import LoginScreen from './components/LoginScreen'
import LandingScreen from './components/LandingScreen'
import TeamInfoPage from './components/TeamInfoPage'
import ScoutingForm from './components/ScoutingForm'
import TasksView from './components/TasksView'

import OrgChart from './components/OrgChart'
import SuggestionsView from './components/SuggestionsView'
import CalendarView from './components/CalendarView'
import UserManagement from './components/UserManagement'
import RequestsView from './components/RequestsView'
import RequestsBadge from './components/RequestsBadge'
import ProfileView from './components/ProfileView'
import ScoutingData from './components/ScoutingData'
import RoleSpec from './components/RoleSpec'
import TeamScoutingData from './components/TeamScoutingData'
import TeamHomeView from './components/TeamHomeView'
import EngineeringNotebook from './components/EngineeringNotebook'
import ScoutingSchedule from './components/ScoutingSchedule'
import CompDayBoard from './components/CompDayBoard'
import { useLiveCompDay } from './hooks/useLiveCompDay'
import HomeView from './components/HomeView'
import QuickChat from './components/QuickChat'
import AllianceHubs from './components/AllianceHubs'
import QuotesManager from './components/QuotesManager'
import AttendanceManager from './components/AttendanceManager'
import AttendanceView from './components/AttendanceView'
import InterestedTeams from './components/InterestedTeams'
import TeamSurveyResponses from './components/TeamSurveyResponses'
import WorkshopIdeas from './components/WorkshopIdeas'
import DesignMatrix from './components/DesignMatrix'
import ChangelogPopup from './components/ChangelogPopup'
import BirthdayConfetti from './components/BirthdayConfetti'
import MatrixRatingRequired from './components/MatrixRatingRequired'
import DailyPulsePopup from './components/DailyPulsePopup'
import TeamPulseDashboard from './components/TeamPulseDashboard'
import { useAppSettings } from './hooks/useAppSettings'
import SettingsView from './components/SettingsView'
import CompDayView from './components/CompDayView'
import PitScoutingForm from './components/PitScoutingForm'
import TestingDashboard from './components/TestingDashboard'
import MeetingRecapPopup from './components/MeetingRecapPopup'
import { MeetingStatsView } from './components/MeetingRecorder'

import { useUser } from './contexts/UserContext'
import { usePermissions } from './hooks/usePermissions'
import { usePresenceContext } from './contexts/PresenceContext'
import { useBackButton } from './hooks/useBackButton'
import ScreenBoundary from './components/ScreenBoundary'
import NotificationNudge from './components/NotificationNudge'
import RestrictedAccess from './components/RestrictedAccess'
import WorkingOnIt from './components/WorkingOnIt'
import TeamGrowthView from './components/TeamGrowthView'
import LogsView from './components/LogsView'
import AbsenceNotice from './components/AbsenceNotice'
import AIManual from './components/AIManual'
import ExpenseRequests from './components/ExpenseRequests'
import { useFeatures, getFeatures, tabOn } from './lib/features'
import NotificationBell from './components/NotificationBell'
import { useToast } from './components/ToastProvider'
import { useNativePush } from './hooks/useNativePush'
import { supabase, authLinkError } from './supabase'

// REST API helpers (avoids Supabase JS client auth token issues)
const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const REST_HEADERS = lazyRestHeaders
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' })
async function restGet(table, query = '') {
  const res = await fetch(`${REST_URL}/rest/v1/${table}?${query}`, { headers: REST_HEADERS })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function restInsert(table, data) {
  const res = await fetch(`${REST_URL}/rest/v1/${table}`, {
    method: 'POST', headers: REST_JSON, body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
}
async function restUpdate(table, filter, data) {
  const res = await fetch(`${REST_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH', headers: REST_JSON, body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
}
// Postgres rejects the whole write when a column is missing, so a task saved
// with several people on it just silently reverts. Say which file to run
// instead of the generic failure — otherwise it looks like the feature is broken.
const MISSING_COLUMN = /(assignees|sides).*(column|schema cache)|column .*(assignees|sides)/i
const saveError = (err, fallback) =>
  MISSING_COLUMN.test(err?.message || '')
    ? 'Run supabase/tasks_sides.sql in Supabase first — the database is missing the columns for multiple people and sides.'
    : fallback

async function restDelete(table, filter) {
  const res = await fetch(`${REST_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE', headers: REST_HEADERS,
  })
  if (!res.ok) throw new Error(await res.text())
}

// Tab access requirements: which minimum tier is needed
const TAB_ACCESS = {
  // All tiers (including guest)
  'home': 'guest', 'boards': 'guest', 'tasks': 'guest', 'calendar': 'guest',
  'profile': 'guest', 'ai-manual': 'guest', 'data': 'guest', 'team-growth': 'teammate', 'suggestions': 'teammate',
  // Teammate+ (restricted from guests)
  'org-chart': 'teammate', 'scouting': 'teammate', 'schedule': 'teammate',
  'log-reach': 'teammate', 'portfolio': 'teammate',
  'budget-tracker': 'teammate', 'fundraising': 'teammate', 'financial-history': 'teammate', 'expense-requests': 'teammate',
  'comms-announcements': 'teammate', 'content-studio': 'teammate', 'website-manager': 'teammate', 'marketing': 'teammate',
  'hw-design': 'teammate', 'hw-fabrication': 'teammate', 'hw-assembly': 'teammate', 'hw-electrical': 'teammate', 'testing': 'teammate', 'design-matrix': 'teammate', 'unfinished-tabs': 'teammate',
  'sw-design': 'teammate', 'sw-programming': 'teammate', 'sw-io': 'teammate', 'bug-tracker': 'teammate',
  'notebook': 'teammate', 'workshops': 'teammate', 'special-controls': 'teammate', 'team-scouting-data': 'teammate',
  'attendance': 'teammate', 'user-management': 'teammate', 'requests': 'teammate',
  'logs-outreach': 'teammate', 'logs-expenses': 'teammate', 'logs-mentor': 'teammate',
}

const TIER_RANK = { guest: 0, teammate: 1, top: 2 }

// Everything a visiting team can reach. They are guests in our app, not
// members of our team, so this is a list of what is open rather than a list of
// what is shut — a page added later is closed to them until someone decides
// otherwise, which is the safe direction for that mistake to go.
//
// Their own boards are allowed too: those carry owner_team and are already
// filtered to theirs. Board ids are made at runtime, so they are recognised by
// not being one of ours rather than by being on a list.
// What a visiting team can reach. The list lives in data/teamTabs.js, shared
// with the welcome screen that explains it — they were written out separately
// once and drifted, leaving teams being told about tabs they did not have.
const TEAM_ALLOWED_TABS = TEAM_TAB_IDS


// fullAccess is a sister team: a second team running the whole app, with its
// own copy of every feature and its own rows behind each one. It is granted
// per team in the database, so an ordinary visiting team is unaffected.
function hasAccess(tab, tier, isTeam, blockedTabs, fullAccess = false) {
  // Checked before the team-account rule, which would otherwise let a blocked
  // tab through.
  if (blockedTabs && blockedTabs.includes(tab)) return false
  if (isTeam && fullAccess) {
    // A sister team is treated as a member team for access. What keeps them
    // apart is the scope on every query behind these tabs, not a shorter menu
    // — a shorter menu was right for a guest, and is wrong for a team running
    // the same season we are.
    const required = TAB_ACCESS[tab]
    if (!required) return true
    return (TIER_RANK[tier] || 0) >= (TIER_RANK[required] || 0)
  }
  if (isTeam) {
    // One of ours, and not on their list — closed.
    if (TAB_ACCESS[tab] && !TEAM_ALLOWED_TABS.includes(tab)) return false
    if (TEAM_ALLOWED_TABS.includes(tab)) return true
    // No TAB_ACCESS entry means a board, and their boards are already filtered
    // to their own by owner_team.
    return !TAB_ACCESS[tab]
  }
  const required = TAB_ACCESS[tab]
  if (!required) return true // board tabs (dynamic) — accessible to all
  return (TIER_RANK[tier] || 0) >= (TIER_RANK[required] || 0)
}

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'bg-brand-blue' },
  { id: '25', title: '25%', color: 'bg-brand-yellow' },
  { id: '50', title: '50%', color: 'bg-brand-silver' },
  { id: '75', title: '75%', color: 'bg-brand-yellow' },
  { id: 'done', title: 'Done', color: 'bg-brand-blue' },
]

const HOME_TAB = { id: 'home', name: 'Home', type: 'home' }
const SCOUTING_TAB = { id: 'scouting', name: 'Scouting', type: 'scouting' }
const BOARDS_TAB = { id: 'boards', name: 'Boards', type: 'boards' }
const DATA_TAB = { id: 'data', name: 'Data', type: 'data' }
const AI_TAB = { id: 'ai-manual', name: 'AI Manual', type: 'ai-manual' }
const TASKS_TAB = { id: 'tasks', name: 'Tasks', type: 'tasks' }
const NOTEBOOK_TAB = { id: 'notebook', name: 'Engineering Notebook', type: 'notebook' }
const ORG_TAB = { id: 'org-chart', name: 'Org Chart', type: 'org-chart' }
const SUGGESTIONS_TAB = { id: 'suggestions', name: 'Suggestions', type: 'suggestions' }
const CALENDAR_TAB = { id: 'calendar', name: 'Calendar', type: 'calendar' }
const SCHEDULE_TAB = { id: 'schedule', name: 'Schedule', type: 'schedule' }
const WORKSHOPS_TAB = { id: 'workshops', name: 'Workshops', type: 'workshops' }
const ATTENDANCE_TAB = { id: 'attendance', name: 'Attendance', type: 'attendance' }
const LOG_TABS = [
  { id: 'logs-outreach', name: 'Outreach', type: 'logs' },
  { id: 'logs-expenses', name: 'Expenses', type: 'logs' },
  { id: 'logs-mentor',   name: 'Mentor',   type: 'logs' },
]
const USER_MGMT_TAB = { id: 'user-management', name: 'User Management', type: 'user-management' }
const SPECIAL_TAB = { id: 'special-controls', name: 'Special Controls', type: 'special-controls' }

// Main is every board's tasks at once, so nobody has to go round three boards
// to see what's outstanding. It's a view rather than a real board — nothing is
// ever filed on it, so it has no row in `boards` and can't be removed.
const MAIN_BOARD = { id: 'main', name: 'Main', permanent: true, readOnly: true }

const DEFAULT_BOARDS = [
  MAIN_BOARD,
  { id: 'business', name: 'Business', permanent: true },
  { id: 'technical', name: 'Technical', permanent: true },
  { id: 'programming', name: 'Programming', permanent: true },
]

// Special Controls is a lead page, but a few things reached through it are for
// everybody. canViewSpecialControls is false for anyone holding a role — CAD,
// Programming, Outreach — so routing these through the tab locked them out of
// their own features. The tab check is skipped when one of these is open.
const OPEN_SPECIAL_VIEWS = ['quotes', 'absence']

// While a Competition Day is live the sidebar shows only these. Special
// Controls stays for whoever already has it; nobody gains it.
const LIVE_DAY_TABS = ['home', 'scouting', 'special-controls']

const SYSTEM_TABS = [HOME_TAB, SCOUTING_TAB, BOARDS_TAB, DATA_TAB, AI_TAB, TASKS_TAB, WORKSHOPS_TAB, NOTEBOOK_TAB, ORG_TAB, SUGGESTIONS_TAB, CALENDAR_TAB, SCHEDULE_TAB, ATTENDANCE_TAB, ...LOG_TABS, USER_MGMT_TAB, SPECIAL_TAB]

const mapTask = (t) => ({
  id: t.id,
  // The board it was made on, the sides it was given to, and the boards those
  // work out of. No sides (including every row written before the column
  // existed) means one board, and the task behaves exactly as it used to.
  boardId: t.board_id,
  sides: t.sides || [],
  boardIds: (t.sides?.length ? boardsForSides(t.sides) : [t.board_id]).filter(Boolean),
  title: t.title,
  description: t.description,
  assignee: t.assignee,
  // Everyone on the task. Rows written before the column existed (and rows
  // given to Everyone / Up for Grabs) just have the one value.
  assignees: t.assignees?.length ? t.assignees : [t.assignee].filter(Boolean),
  dueDate: t.due_date,
  mentor: t.mentor || '',
  assignedBy: t.assigned_by || '',
  status: t.status,
  skills: t.skills || [],
  priority: t.priority || 'medium',
  createdAt: t.created_at,
  completedAt: t.completed_at,
})

// A task can sit on several boards at once, so a local change has to reach
// every copy of it — otherwise the board you are not looking at stays stale
// until the next reload. The row is shared, so the REST write is still one call.
const patchEveryBoard = (byTab, taskId, patch) => {
  const updated = {}
  for (const boardId in byTab) {
    updated[boardId] = byTab[boardId].map(t => t.id === taskId ? { ...t, ...patch } : t)
  }
  return updated
}

// Put a task on exactly the boards it names and take it off the rest, which is
// what an edit that adds or drops a side has to do.
const placeTask = (byTab, task) => {
  const boards = task.boardIds?.length ? task.boardIds : [task.boardId]
  const updated = {}
  for (const boardId in byTab) {
    const list = byTab[boardId]
    if (boards.includes(boardId)) {
      updated[boardId] = list.some(t => t.id === task.id)
        ? list.map(t => t.id === task.id ? task : t)
        : [...list, task]
    } else {
      updated[boardId] = list.filter(t => t.id !== task.id)
    }
  }
  return updated
}

// Restore cached data from localStorage for instant load (only for Radical members)
function getCachedData() {
  try {
    // Team accounts should not use Radical's cached boards/tasks
    if (localStorage.getItem('scrum-is-team') === 'true') return null
    const cached = localStorage.getItem('scrum-cache')
    if (cached) {
      const { tabs: cachedTabs, tasksByTab: cachedTasks } = JSON.parse(cached)
      if (cachedTabs && cachedTasks) {
        return { tabs: [...SYSTEM_TABS, ...cachedTabs], tasksByTab: cachedTasks }
      }
    }
  } catch (e) { /* ignore corrupt cache */ }
  return null
}

const ROLE_EMOJIS = {
  'Communications': { emoji: '📣', label: 'Communications' },
  'Finance': { emoji: '💰', label: 'Finance' },
  'Outreach': { emoji: '🌍', label: 'Outreach' },
  'CAD': { emoji: '📐', label: 'CAD Designer' },
  'Assembly/Building': { emoji: '🔧', label: 'Assembly / Building' },
  'Wiring': { emoji: '🔌', label: 'Wiring' },
  'Programming': { emoji: '⌨️', label: 'Programmer' },
  'Scouting': { emoji: '🔍', label: 'Scout' },
  'Co-Founder': { emoji: '👑', label: 'Co-Founder' },
  'Mentor': { emoji: '🎓', label: 'Mentor' },
  'Coach': { emoji: '🏆', label: 'Coach' },
  'Project Manager': { emoji: '🚀', label: 'Project Manager' },
  'Business Lead': { emoji: '💼', label: 'Business Lead' },
  'Technical Lead': { emoji: '⚙️', label: 'Technical Lead' },
  'Co-Project Manager': { emoji: '🚀', label: 'Co-Project Manager' },
  'Co-Business Lead': { emoji: '💼', label: 'Co-Business Lead' },
  'Co-Technical Lead': { emoji: '⚙️', label: 'Co-Technical Lead' },
  'Co-Programming Lead': { emoji: '💻', label: 'Co-Programming Lead' },
}

function RoleChangeModal({ alert, onDismiss }) {
  if (!alert) return null

  let emoji = '🎉'
  let title = ''
  let subtitle = ''

  if (alert.type === 'added') {
    const role = alert.roles[0]
    const info = ROLE_EMOJIS[role] || { emoji: '🎉', label: role }
    emoji = info.emoji
    title = `You're now: ${role}!`
    subtitle = alert.roles.length > 1
      ? `Also added: ${alert.roles.slice(1).join(', ')}`
      : 'Your permissions have been updated.'
  } else if (alert.type === 'removed') {
    emoji = '📋'
    title = `Role removed: ${alert.roles.join(', ')}`
    subtitle = 'Your permissions have been updated.'
  } else if (alert.type === 'tier') {
    const tierLabels = { top: 'Admin', teammate: 'Teammate', guest: 'Guest' }
    emoji = alert.tier === 'guest' ? '👁️' : alert.tier === 'top' ? '⭐' : '🤝'
    title = `Access level: ${tierLabels[alert.tier] || alert.tier}`
    subtitle = 'Your permissions have been updated.'
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={onDismiss} />
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 pointer-events-auto text-center animate-bounce-in">
          <div className="text-7xl mb-4">{emoji}</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
          <p className="text-sm text-gray-500 mb-6">{subtitle}</p>
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 bg-brand-yellow hover:bg-brand-yellow-dark rounded-xl font-semibold text-gray-700 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </>
  )
}

function App() {
  const { username, isLead, user, loading, passwordRecovery, mustChangePassword, updatePassword, sessionExpired, sessionLost, logout, roleChangeAlert, dismissRoleChangeAlert, isTeam, teamNumber, teamFullAccess, reportTeamFullAccess, functionTags } = useUser()
  // The team this session works in when it isn't Radical: a team login, or a
  // member of another team. Boards and tasks are read by it, so they must be
  // stamped with it too; stamping only team logins filed every other member's
  // boards and tasks under Radical. Null means Radical (owner_team NULL).
  const sessionTeam = teamNumber && String(teamNumber) !== HOME_TEAM_NUMBER ? String(teamNumber) : null
  // Derive team status directly from user email OR function_tags — never depends on async context timing
  const effectiveIsTeam = isTeam || !!(user?.email && /^team\d+@teams\.radical$/.test(user.email.toLowerCase())) || (functionTags && functionTags.includes('Team'))
  const { canEditContent, canRequestContent, canReviewRequests, canImport, canDragAnyTask, canDragOwnTask, canManageUsers, tier, isGuest, hasLeadTag, isCofounder, canViewSpecialControls, canViewOutreachTabs, canViewFinanceTabs, canViewCommsTabs, canViewHardwareTabs, canViewSoftwareTabs, myTeamNumber} = usePermissions()

  const SCOPE = teamScope(myTeamNumber)
  // The Competition Day that is live, if any. When one starts, everyone is
  // taken to its scouting screen (the Schedule tab shows it while it is live).
  // Optional features, switched on and off in Settings. Only the Scrum boards
  // are always there; a live Competition Day needs Scouting switched on.
  const features = useFeatures()
  const liveDayRaw = useLiveCompDay(SCOPE)
  const liveDay = features.scouting ? liveDayRaw : null
  const liveDayId = liveDay?.id || null
  useEffect(() => {
    if (liveDayId && username) setActiveTab('home')
  }, [liveDayId, username]) // eslint-disable-line react-hooks/exhaustive-deps
  // The task-load popup renders in several places, so it asks for navigation
  // by event instead of a threaded callback.
  useEffect(() => {
    const go = (e) => { if (e.detail) { setCameFromPerson(''); setViewPersonTasks(e.detail) } }
    const assign = (e) => {
      if (!e.detail) return
      setPrefillAssignee(e.detail)
      setCameFromPerson('')
      setIsModalOpen(true)
    }
    window.addEventListener('view-person-tasks', go)
    window.addEventListener('assign-task-to', assign)
    return () => {
      window.removeEventListener('view-person-tasks', go)
      window.removeEventListener('assign-task-to', assign)
    }
  }, [])

  // Tabs this user can't reach, whatever their tier.
  // What the load actually found out about this team.
  //
  // teamFullAccess comes from a lookup in UserContext that this component does
  // not wait for, so it can still be false while the load already knows
  // better. The tabs were fixed by asking during the load; the dashboard was
  // not, and went on choosing the cut-down TeamHomeView from the stale value —
  // which is the "version without many features" that kept coming back.
  //
  // Everything in App now reads the same answer: whichever of the two is true.
  const [loadedFullAccess, setLoadedFullAccess] = useState(false)
  const effectiveFullAccess = teamFullAccess || loadedFullAccess

  const blockedTabs = []
  if (!isCofounder) blockedTabs.push('chat-all', 'chat-alliances', 'chat-leagues')
  if (!canViewSpecialControls) blockedTabs.push('special-controls')
  // Unfinished role pages are lead-only while they're parked in Special
  // Controls — role holders shouldn't stumble into half-built screens.
  if (!isCofounder) {
    blockedTabs.push(
      'unfinished-tabs',
      'log-reach', 'portfolio',
      'budget-tracker', 'fundraising', 'financial-history',
      'comms-announcements', 'content-studio', 'website-manager', 'marketing',
      'hw-design', 'hw-fabrication', 'hw-assembly', 'hw-electrical',
      'sw-design', 'sw-programming', 'sw-io', 'bug-tracker',
      'testing', 'design-matrix', 'expense-requests',
    )
  }
  const { addToast } = useToast()
  useNativePush() // iOS Capacitor only — registers for APNs and saves token
  const { onlineUsers, presenceState } = usePresenceContext()
  useBackButton()
  const [isLoading, setIsLoading] = useState(() => !effectiveIsTeam && getFeatures().intro)
  const [radicalMsg] = useState(() => {
    const msgs = ['Going limitless...', 'Revving the robots...', 'Charging up the SCRUM...', 'Limitless Scrum incoming...', 'Deploying limitless vibes...', 'Scrumming it up...', 'Activating turbo mode...', 'Warming up the gears...']
    return msgs[Math.floor(Math.random() * msgs.length)]
  })
  const cachedData = useRef(getCachedData())
  const [tabs, setTabs] = useState(() => {
    if (cachedData.current?.tabs) return cachedData.current.tabs
    // Team accounts get only the system tabs open to them, and no default
    // boards — theirs load from the database by owner_team. Offering a tab
    // hasAccess will refuse is a door that doesn't open.
    if (effectiveIsTeam) return effectiveFullAccess
      ? [...SYSTEM_TABS]
      : SYSTEM_TABS.filter(t => TEAM_ALLOWED_TABS.includes(t.id))
    return [...SYSTEM_TABS, ...DEFAULT_BOARDS]
  })
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('scrum-active-tab')
    // Clear removed tabs so users don't land on a dead page
    const removed = ['announcements', 'quick-chat']
    if (saved && removed.includes(saved)) {
      localStorage.removeItem('scrum-active-tab')
      return 'home'
    }
    return saved || 'home'
  })

  // A page whose feature is switched off can't be opened: a saved tab, a
  // notification or a link to it lands on Home, or the Main board without Home.
  useEffect(() => {
    if (!tabOn(features, activeTab)) setActiveTab(features.home ? 'home' : 'main')
  }, [activeTab, features]) // eslint-disable-line react-hooks/exhaustive-deps

  // A visiting team opens on their own dashboard, not on a board. Anything
  // they can no longer reach sends them there too, which covers a tab saved
  // from before their access changed.
  useEffect(() => {
    if (!effectiveIsTeam) return
    if (!hasAccess(activeTab, tier, true, blockedTabs, effectiveFullAccess)) setActiveTab('home')
  }, [effectiveIsTeam, activeTab]) // eslint-disable-line

  // When a team logs in, skip the loading screen — they land on their boards.
  useEffect(() => {
    if (effectiveIsTeam) {
      setIsLoading(false)
    }
  }, [effectiveIsTeam])
  const [tasksByTab, setTasksByTab] = useState(() => cachedData.current?.tasksByTab || {})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)


  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [specialView, setSpecialView] = useState(null)
  // Where the current special view was opened from. Home's shortcut buttons set
  // this to 'home' so Back returns to Home instead of dropping you in the
  // Special Controls menu you never went through.
  const [specialFrom, setSpecialFrom] = useState(null)
  // The session screen renders inside the Attendance tab rather than through
  // Special Controls — that tab is blocked for most people, so routing members
  // through it would just bounce them off the access check.
  const [showSessions, setShowSessions] = useState(false)
  const [viewTask, setViewTask] = useState(null)
  const [viewPersonTasks, setViewPersonTasks] = useState(null) // display_name
  const [prefillAssignee, setPrefillAssignee] = useState('')
  // Set when a board was opened from someone's task page, so we can offer
  // "Back to <name>'s tasks" instead of stranding the lead on the board.
  const [cameFromPerson, setCameFromPerson] = useState('')
  const { settings: appSettings, updateSettings: updateAppSettings } = useAppSettings()
  const [loadError, setLoadError] = useState(null)
  // A rejected email link goes straight to Sign In, where the reason is shown.
  const [landingChoice, setLandingChoice] = useState(authLinkError ? 'login' : null)
  const [viewingProfileId, setViewingProfileId] = useState(null)
  const [profileReturnTab, setProfileReturnTab] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [musicStarted, setMusicStarted] = useState(false)
  const audioRef = useRef(null)
  const [compDayLock, setCompDayLock] = useState(null) // { role: 'scouting' | 'drive-team' | ... } or null
  // Scouting is parked with the unfinished tabs until it's ready. The kiosk
  // accounts and Comp Day scouts still need the form, so they keep it.
  // Scouting is open to the team: scouts fill it in, and the only link to it
  // used to live inside the Competition Day block, so outside a comp-day
  // lockdown there was no way in at all. Schedule stays where it was.
  if (!isCofounder && !effectiveIsTeam && !compDayLock && !liveDay) blockedTabs.push('schedule')
  const [showPulse, setShowPulse] = useState(false)

  // Default sounds off for team accounts on first login
  useEffect(() => {
    if (effectiveIsTeam && !localStorage.getItem('scrum-team-defaults-set')) {
      localStorage.setItem('scrum-sfx-enabled', 'false')
      localStorage.setItem('scrum-music-pref', 'off')
      localStorage.setItem('scrum-team-defaults-set', 'true')
    }
  }, [effectiveIsTeam])

  // Daily Pulse trigger — once per day per user, skippable, disable-able in settings.
  // Local-only for now: import.meta.env.DEV is false in a production build, so
  // nobody on the deployed site gets the popup and it never queries for one.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!user?.id || effectiveIsTeam || isLoading) return
    if (appSettings.teamPulseEnabled === false) return // team-wide off switch (Special Controls)
    const d = new Date()
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (localStorage.getItem(`pulse_skipped_${todayKey}`)) return
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    const headers = restHeaders()
    let cancelled = false
    ;(async () => {
      try {
        const [prefRes, pulseRes] = await Promise.all([
          fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=notification_prefs`, { headers }),
          fetch(`${url}/rest/v1/daily_pulse?${SCOPE}&user_id=eq.${user.id}&pulse_date=eq.${todayKey}&select=id&limit=1`, { headers }),
        ])
        if (cancelled) return
        const prefs = (await prefRes.json())[0]?.notification_prefs || {}
        if (prefs.pulse === false) return
        const existing = await pulseRes.json()
        if (Array.isArray(existing) && existing.length > 0) return
        setTimeout(() => { if (!cancelled) setShowPulse(true) }, 1500)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [user?.id, effectiveIsTeam, isLoading, appSettings.teamPulseEnabled])

  // Comp Day screen captivation — check if there's a live session with an active block and user has a role
  useEffect(() => {
    if (!username || hasLeadTag || effectiveIsTeam || !features.scouting) { setCompDayLock(null); return }
    let cancelled = false
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const headers = restHeaders()

    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        // Find active session
        const sessRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_sessions?${SCOPE}&is_active=eq.true&limit=1&select=id`, { headers })
        const sessions = await sessRes.json()
        if (!Array.isArray(sessions) || sessions.length === 0) { if (!cancelled) setCompDayLock(null); return }
        const sessionId = sessions[0].id
        // Find active block
        const blockRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_blocks?${SCOPE}&session_id=eq.${sessionId}&is_active=eq.true&limit=1&select=id`, { headers })
        const blocks = await blockRes.json()
        if (!Array.isArray(blocks) || blocks.length === 0) { if (!cancelled) setCompDayLock(null); return }
        // Find my assignment
        const assignRes = await fetch(`${supabaseUrl}/rest/v1/comp_day_assignments?${SCOPE}&block_id=eq.${blocks[0].id}&username=eq.${encodeURIComponent(username)}&limit=1&select=role`, { headers })
        const assigns = await assignRes.json()
        if (!cancelled) {
          if (Array.isArray(assigns) && assigns.length > 0) {
            setCompDayLock({ role: assigns[0].role })
          } else {
            setCompDayLock(null)
          }
        }
      } catch { if (!cancelled) setCompDayLock(null) }
    }
    check()
    // Realtime below is the fast path; this is the safety net, and it sits
    // out while the tab is hidden. Coming back re-checks at once.
    const interval = setInterval(check, 30000)
    document.addEventListener('visibilitychange', check)

    // Also listen for realtime changes
    const channel = supabase
      .channel('comp-day-lock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comp_day_sessions' }, check)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comp_day_blocks' }, check)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comp_day_assignments' }, check)
      .subscribe()

    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', check); supabase.removeChannel(channel) }
  }, [username, hasLeadTag, effectiveIsTeam, features.scouting])

  // Force tab when comp day lock is active
  useEffect(() => {
    if (!compDayLock) return
    const roleTabMap = {
      'scouting': ['comp-day', 'scouting', 'schedule', 'data'],
      'drive-team': ['comp-day', 'chat-all', 'chat-alliances', 'chat-leagues', 'schedule'],
      'pit-crew': ['comp-day', 'schedule'],
      'spirit': ['comp-day', 'schedule'],
      'bag-watch': ['comp-day', 'schedule'],
      'break': ['comp-day', 'schedule'],
      'strategy': ['comp-day', 'data', 'chat-all', 'chat-alliances', 'chat-leagues', 'schedule'],
      'safety': ['comp-day', 'schedule'],
    }
    const allowedTabs = roleTabMap[compDayLock.role] || ['comp-day']
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0])
    }
  }, [compDayLock, activeTab])

  // Heartbeat: update last_seen_at every 30s while the app is on screen, so
  // presence dots and attendance know who's online (both allow a few missed
  // beats). Every write also fans out over realtime to everyone listening on
  // profiles, so it stays slow and stops while the tab is hidden; coming back
  // pings straight away.
  useEffect(() => {
    if (!username) return
    const filter = `display_name=eq.${encodeURIComponent(username)}`
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      restUpdate('profiles', filter, { last_seen_at: new Date().toISOString() }).catch(() => {})
    }
    ping() // immediate on login
    const interval = setInterval(ping, 30000)
    document.addEventListener('visibilitychange', ping)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', ping) }
  }, [username])

  // Scheduled-notification processor: leads poll every 60s to fire due notifications
  useEffect(() => {
    if (!canEditContent) return
    const processScheduled = () => {
      fetch(`${REST_URL}/functions/v1/process-scheduled`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json' }),
        body: '{}',
      }).catch(() => {})
    }
    processScheduled()
    const interval = setInterval(processScheduled, 60000)
    return () => clearInterval(interval)
  }, [canEditContent])

  // Keep localStorage cache in sync so refresh always has latest data
  const syncCache = useCallback((updatedTasks) => {
    try {
      const boardTabs = tabs.filter(t => !t.type)
      if (boardTabs.length > 0) {
        localStorage.setItem('scrum-cache', JSON.stringify({ tabs: boardTabs, tasksByTab: updatedTasks }))
      }
    } catch (e) { /* ignore quota errors */ }
  }, [tabs])

  // Send a notification when someone is assigned a task
  const notifyAssignee = useCallback(async (assigneeName, taskTitle) => {
    if (!assigneeName || assigneeName === '__up_for_grabs__' || !taskTitle) return
    // Don't notify yourself
    if (assigneeName.toLowerCase() === username.toLowerCase()) return
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const headers = restHeaders()
    try {
      // Look up the assignee's user ID by display_name
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?display_name=ilike.${encodeURIComponent(assigneeName)}&select=id`,
        { headers }
      )
      if (!res.ok) return
      const profiles = await res.json()
      if (!profiles || profiles.length === 0) return
      const targetUserId = profiles[0].id
      const notif = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        user_id: targetUserId,
        type: 'task_assigned',
        title: 'Task Assigned',
        body: `${username} assigned you to "${taskTitle}"`,
      }
      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(notif),
      })
      triggerPush(notif)
    } catch (err) {
      console.error('Failed to notify assignee:', err)
    }
  }, [username])

  // Load boards and tasks from Supabase once user is authenticated
  const loadData = useCallback(async () => {
    if (!user) return
    setLoadError(null)

    try {
      // Boards first, because which boards you can see decides which tasks
      // you are allowed to be sent.
      //
      // A team account with no number loads nothing. That used to be
      // impossible to reach; now that the fallback no longer hands them ours,
      // it is, and loading nothing is the right answer — better a team sees an
      // empty app than somebody else's.
      if (isTeam && !teamNumber) {
        console.warn('Team account with no team number — loading nothing.')
        setTabs(fullAccessNow ? [...SYSTEM_TABS] : SYSTEM_TABS.filter(t => TEAM_ALLOWED_TABS.includes(t.id)))
        setTasksByTab({})
        setIsLoading(false)
        return
      }

      // Which team's data to load is a question about the TEAM, not about the
      // kind of login. isTeam only means "a shared team account" — so a
      // student whose profile sits on 38350 fell down the Radical branch and
      // was served Radical's boards and tasks. That is both a leak and why
      // their own team looked like it had nothing in it.
      const scopedToTeam = !!(teamNumber && String(teamNumber) !== HOME_TEAM_NUMBER)

      // Whether this team runs the whole app, asked here rather than trusted
      // from state.
      //
      // teamFullAccess resolves from its own lookup, and this load does not
      // wait for it. Whichever finished first decided which tabs got built,
      // so Prime Suspects kept coming up with the cut-down screen — and no
      // amount of adding dependencies fixed it reliably, because the race was
      // the design. Asking for the answer in the same breath as the boards
      // removes the race instead of narrowing it.
      //
      // Falls back to the state value, so a failed lookup is no worse than
      // before rather than a downgrade.
      let fullAccessNow = teamFullAccess
      if (scopedToTeam) {
        try {
          const rows = await restGet('team_accounts',
            `select=full_access&team_number=eq.${encodeURIComponent(teamNumber)}`)
          if (Array.isArray(rows) && rows.length) {
            fullAccessNow = !!rows[0].full_access
            setLoadedFullAccess(fullAccessNow)
            // Tell the context too. The Sidebar renders the whole feature
            // menu and reads teamFullAccess through usePermissions — eleven
            // gates on it — so fixing only App's own copy left the menu
            // hidden. One answer, shared, rather than a fix per component.
            reportTeamFullAccess?.(fullAccessNow)
          }
        } catch { /* keep whatever state had */ }
      }
      const boardQuery = scopedToTeam
        ? `select=*&order=created_at&owner_team=eq.${encodeURIComponent(teamNumber)}`
        : 'select=*&order=created_at&owner_team=is.null'

      const boards = await restGet('boards', boardQuery)

      // Tasks were fetched as select=* — EVERY task of EVERY team, pulled into
      // the browser. The screen only drew the ones whose board was on screen,
      // so it looked contained, but the rest were sitting in memory for anyone
      // who opened the network tab. Ask only for the boards we can see.
      //
      // Radical also owns every task written before boards had an owner, which
      // is why the default side keeps board_id is.null in scope.
      // Owner, not board list: it is the same rule boards use, and unlike a
      // board list the server can apply it to the live subscription as well.
      // Falls back to the board list if the column is not there yet, so this
      // keeps working either way.
      let tasks = []
      try {
        tasks = await restGet('tasks', scopedToTeam
          ? `select=*&owner_team=eq.${encodeURIComponent(teamNumber)}`
          : 'select=*&owner_team=is.null')
      } catch (err) {
        console.warn('tasks.owner_team not present yet — scoping by board instead.')
        const ids = boards.map(b => `"${String(b.id).replace(/"/g, '')}"`).join(',')
        tasks = scopedToTeam
          ? (boards.length ? await restGet('tasks', `select=*&board_id=in.(${ids})`) : [])
          : await restGet('tasks', 'select=*')
      }

      if (!scopedToTeam) {
        // Seed default boards if missing (only for Radical members). Only
        // someone who may create boards (a lead or a team login; the database
        // refuses anyone else) tries: before a sister team's profile has
        // loaded, their session looks like Radical's for a moment.
        const existingIds = boards.map(b => b.id)
        // Main is a view over the others, so it never gets a row of its own.
        const missing = DEFAULT_BOARDS.filter(b => !b.readOnly && !existingIds.includes(b.id))
        if (missing.length > 0 && canEditContent) {
          try {
            for (const b of missing) {
              await restInsert('boards', { id: b.id, name: b.name, permanent: true })
            }
          } catch (e) {
            console.error('Failed to seed default boards:', e.message)
          }
        }

        const allBoards = missing.length > 0
          ? [...boards, ...missing.map(b => ({ id: b.id, name: b.name, permanent: true }))]
          : boards

        const defaultIds = DEFAULT_BOARDS.map(b => b.id)
        const extra = allBoards
          .filter(b => !defaultIds.includes(b.id))
          .map(b => ({ id: b.id, name: b.name, permanent: b.permanent }))
        const boardTabs = [...DEFAULT_BOARDS, ...extra]
        setTabs([...SYSTEM_TABS, ...boardTabs])

        const grouped = {}
        allBoards.forEach(b => { grouped[b.id] = [] })
        tasks.forEach(t => {
          const mapped = mapTask(t)
          // One row, filed under each of its boards — so the same task object
          // shows on every side it was given to.
          let placed = false
          mapped.boardIds.forEach(b => {
            if (grouped[b] !== undefined) { grouped[b].push(mapped); placed = true }
          })
          // A task whose board no longer exists used to be dropped here, and
          // then showed nowhere: not on any board, but still on the dashboard,
          // which asks by assignee and does not care about boards. Decide
          // Awards sat on a deleted board for weeks exactly like that.
          //
          // Keep it instead, under its own missing board id. No tab renders
          // that id, but Main gathers every bucket, so the task surfaces there
          // where somebody can see it and move it.
          if (!placed) {
            const key = mapped.boardIds[0] || mapped.boardId || 'unfiled'
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(mapped)
          }
        })
        setTasksByTab(grouped)

        try {
          localStorage.setItem('scrum-cache', JSON.stringify({ tabs: boardTabs, tasksByTab: grouped }))
        } catch (e) { /* ignore quota errors */ }
      } else {
        // Team view: their boards, and only the system tabs open to them.
        // This put every system tab back, quietly undoing the filter the
        // initial list applies.
        // Main, then their own boards. Every team gets Main: it is the one
        // place that shows everything outstanding at once, and a team with
        // three boards needs that as much as we do. It is a view, not a board
        // — no row in `boards`, nothing filed on it, cannot be removed — so
        // the tasks come from the other tabs further down rather than from a
        // query of its own.
        const boardTabs = [MAIN_BOARD, ...boards.map(b => ({ id: b.id, name: b.name, permanent: false }))]
        // The cut-down tab list is for a visiting team's shared login. A
        // person on another team is still a person, and a sister team's
        // account runs the whole app, so both get everything.
        const systemTabs = (!isTeam || fullAccessNow)
          ? SYSTEM_TABS
          : SYSTEM_TABS.filter(t => TEAM_ALLOWED_TABS.includes(t.id))
        setTabs([...systemTabs, ...boardTabs])

        const grouped = {}
        boards.forEach(b => { grouped[b.id] = [] })
        tasks.forEach(t => {
          const mapped = mapTask(t)
          // One row, filed under each of its boards — so the same task object
          // shows on every side it was given to.
          mapped.boardIds.forEach(b => {
            if (grouped[b] !== undefined) grouped[b].push(mapped)
          })
        })
        setTasksByTab(grouped)
      }
    } catch (err) {
      console.error('Unexpected error loading data:', err)
      setLoadError('Failed to load data. Please try again.')
    }
    // teamFullAccess decides which tabs a sister team gets, and it resolves
    // from a lookup that can land after this has already run. Without it in
    // here, whichever finished first decided — so the team's features appeared
    // or vanished at random, and on every refresh.
  }, [user?.id, isTeam, teamNumber, teamFullAccess])  // loadedFullAccess is set BY this; adding it would loop

  useEffect(() => {
    loadData()
  }, [loadData])

  // Real-time: listen for board changes (use payload, no re-query)
  useEffect(() => {
    const channel = supabase
      .channel('boards-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'boards' }, onlyMyTeam((payload) => {
        const b = payload.new
        // Only add board if it belongs to our view
        if (sessionTeam) {
          if (b.owner_team !== sessionTeam) return
        } else {
          if (b.owner_team) return
        }
        setTabs(prev => {
          if (prev.some(t => t.id === b.id)) return prev
          return [...prev, { id: b.id, name: b.name, permanent: b.permanent }]
        })
        setTasksByTab(prev => ({ ...prev, [b.id]: prev[b.id] || [] }))
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'boards' }, onlyMyTeam((payload) => {
        const id = payload.old.id
        setTabs(prev => prev.filter(t => t.id !== id))
        setTasksByTab(prev => {
          const updated = { ...prev }
          delete updated[id]
          return updated
        })
      }))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isTeam, teamNumber])

  // Real-time: listen for task changes (use payload, no re-query)
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'tasks',
        // Server-side, so another team's rows never reach this browser. The UI
        // check below still stands as a second line, but it was the only line.
        ...(sessionTeam ? { filter: `owner_team=eq.${sessionTeam}` } : {}),
      }, (payload) => {
        const task = mapTask(payload.new)
        setTasksByTab(prev => {
          const updated = { ...prev }
          let changed = false
          task.boardIds.forEach(boardId => {
            if (updated[boardId] === undefined) return // Not our board
            if (updated[boardId].some(t => t.id === task.id)) return
            updated[boardId] = [...updated[boardId], task]
            changed = true
          })
          return changed ? updated : prev
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, onlyMyTeam((payload) => {
        const task = mapTask(payload.new)
        // The sides can change in an edit, so walk every board: the task joins
        // the ones it now names and leaves the ones it doesn't. Progress rides
        // along with it, which is what keeps the boards showing the same thing.
        setTasksByTab(prev => placeTask(prev, task))
      }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        const id = payload.old.id
        setTasksByTab(prev => {
          const updated = {}
          for (const boardId in prev) {
            updated[boardId] = prev[boardId].filter(t => t.id !== id)
          }
          return updated
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Save activeTab locally (each user picks their own view)
  useEffect(() => {
    localStorage.setItem('scrum-active-tab', activeTab)
    if (activeTab !== 'special-controls') { setSpecialView(null); setSpecialFrom(null) }
  }, [activeTab])

  const isMain = activeTab === MAIN_BOARD.id
  // Main gathers every board. A task on two sides is one row, not two, so it
  // is keyed by id — the multi-side tasks genuinely live on several boards.
  const tasks = isMain
    ? Object.entries(tasksByTab)
        .filter(([id]) => id !== MAIN_BOARD.id)
        .flatMap(([, list]) => list)
        .filter((t, i, all) => all.findIndex(x => x.id === t.id) === i)
    : (tasksByTab[activeTab] || [])

  // Home opens the read-only task details (everyone can read; editing stays
  // with leads inside that popup) rather than jumping to the board editor.
  const openTaskDetail = (boardId, taskId) => {
    const list = tasksByTab[boardId] || []
    const task = list.find(t => String(t.id) === String(taskId))
    if (task) setViewTask(task)
    else openTaskFromHome(boardId, taskId) // board not loaded yet — fall back
  }

  // Open a specific task on its Scrum board (used by lead flows)
  const openTaskFromHome = (boardId, taskId) => {
    if (boardId) setActiveTab(boardId)
    const list = tasksByTab[boardId] || []
    const task = list.find(t => String(t.id) === String(taskId))
    if (task) setEditingTask(task)
  }

  // Back out of a special view to wherever it was opened from.
  const closeSpecial = () => {
    if (specialFrom === 'home') { setSpecialView(null); setSpecialFrom(null); setActiveTab('home') }
    else setSpecialView(null)
  }

  // Renaming a board. The id never changes, so every task on it stays put.
  const handleRenameTab = async (tabId, name) => {
    const clean = (name || '').trim()
    if (!clean || !canEditContent) return
    if (tabId === 'main' || tabs.find(t => t.id === tabId)?.readOnly) return
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name: clean } : t))
    try {
      const res = await fetch(`${REST_URL}/rest/v1/boards?id=eq.${tabId}`, {
        method: 'PATCH', headers: REST_JSON, body: JSON.stringify({ name: clean }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to rename the board:', err)
      addToast('Failed to rename the board.', 'error')
    }
  }

  const handleAddTab = async (name) => {
    const newId = String(Date.now()) + Math.random().toString(36).slice(2)
    // Update UI immediately (optimistic)
    setTabs(prev => [...prev, { id: newId, name, permanent: false }])
    setTasksByTab(prev => ({ ...prev, [newId]: [] }))
    setActiveTab(newId)
    // Persist via REST, tagged with the team this session works in
    const boardData = { id: newId, name, permanent: false }
    if (sessionTeam) boardData.owner_team = sessionTeam
    try {
      await restInsert('boards', boardData)
      notifyLeadOfCoLeadAction({ actor: username, tags: functionTags, type: 'board', detail: name })
    } catch (err) {
      console.error('Failed to save board:', err.message)
      setTabs(prev => prev.filter(t => t.id !== newId))
      setTasksByTab(prev => {
        const updated = { ...prev }
        delete updated[newId]
        return updated
      })
      setActiveTab(effectiveIsTeam ? 'home' : 'business')
      addToast('Failed to create board. Please try again.', 'error')
    }
  }

  const handleDeleteTab = async (tabId) => {
    // Main is a view of the other boards, not a board — there is nothing on it
    // to delete, and removing it would only take away the one place that shows
    // everything at once.
    if (tabId === 'main' || tabs.find(t => t.id === tabId)?.readOnly) return
    if (tabId === 'home' || tabId === 'scouting' || tabId === 'boards' || tabId === 'data' || tabId === 'ai-manual' || tabId === 'tasks' || tabId === 'workshops' || tabId === 'notebook' || tabId === 'org-chart' || tabId === 'calendar' || tabId === 'attendance' || tabId.startsWith('logs') || tabId === 'user-management' || tabId === 'profile' || tabId === 'settings' || tabId === 'comp-day' || tabId === 'requests' || tabId === 'schedule' || tabId === 'special-controls') return
    const board = tabs.find(t => t.id === tabId)
    const count = (tasksByTab[tabId] || []).length
    // Default boards come back empty on the next load — the app re-seeds them —
    // so deleting one really means clearing it. Say that, rather than letting
    // someone discover it.
    const warning = board?.permanent
      ? `"${board.name}" is one of the three default boards. Deleting it removes its ${count} `
        + `task${count === 1 ? '' : 's'}, and the board itself will come back empty. Continue?`
      : `Delete "${board?.name || 'this board'}"${count ? ` and its ${count} task${count === 1 ? '' : 's'}` : ''}? This cannot be undone.`
    if (!window.confirm(warning)) return

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    // Delete tasks for this board via REST
    const tasksRes = await fetch(`${supabaseUrl}/rest/v1/tasks?board_id=eq.${tabId}`, {
      method: 'DELETE',
      headers: restHeaders(),
    })
    if (!tasksRes.ok) {
      addToast('Failed to delete board tasks.', 'error')
      return
    }

    // Delete the board itself via REST
    const boardRes = await fetch(`${supabaseUrl}/rest/v1/boards?id=eq.${tabId}`, {
      method: 'DELETE',
      headers: restHeaders(),
    })
    if (!boardRes.ok) {
      addToast('Failed to delete board.', 'error')
      return
    }

    // Supabase confirmed — now update UI
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setTasksByTab(prev => {
      const updated = { ...prev }
      delete updated[tabId]
      return updated
    })
    if (activeTab === tabId) {
      setActiveTab('business')
    }
  }

  const handleDragEnd = async (result) => {
    if (!result.destination) return
    const { source, destination, draggableId } = result
    if (source.droppableId === destination.droppableId) return

    // Update locally + sync cache
    setTasksByTab(prev => {
      const updated = patchEveryBoard(prev, draggableId, { status: destination.droppableId })
      syncCache(updated)
      return updated
    })

    // Update via REST
    try {
      await restUpdate('tasks', `id=eq.${draggableId}`, completionFields(destination.droppableId))
    } catch (err) {
      console.error('Failed to update task status:', err.message)
      addToast('Failed to move task.', 'error')
    }
  }

  const handleMarkDone = async (taskId) => {
    // Find the task title before updating state
    const allTasks = tasksByTab[activeTab] || []
    const doneTask = allTasks.find(t => t.id === taskId)
    const taskTitle = doneTask?.title || 'a task'

    setTasksByTab(prev => {
      const updated = patchEveryBoard(prev, taskId, { status: 'completed', completedAt: new Date().toISOString() })
      syncCache(updated)
      return updated
    })
    try {
      await restUpdate('tasks', `id=eq.${taskId}`, completionFields('completed'))
      addToast('Task marked as done!', 'success')

      // Send scoped notifications for task completion
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const headers = restHeaders()
      const jsonHeaders = { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }

      try {
        const completerName = username || localStorage.getItem('scrum-username') || 'Someone'
        const res = await fetch(`${supabaseUrl}/rest/v1/profiles?${storedTeamScope()}&select=id,display_name,function_tags`, { headers })
        if (!res.ok) throw new Error('Failed to fetch profiles')
        const allProfiles = await res.json()

        let targetProfiles = []
        if (effectiveIsTeam && teamNumber) {
          targetProfiles = []
        } else {
          // Regular member: notify all other regular members (non-team accounts)
          targetProfiles = allProfiles.filter(p => {
            if (p.display_name === completerName) return false // don't notify self
            const tags = p.function_tags || []
            return !tags.includes('Team')
          })
        }

        if (targetProfiles.length > 0) {
          const notifs = targetProfiles.map(p => ({
            id: String(Date.now()) + Math.random().toString(36).slice(2) + p.id.slice(0, 4),
            user_id: p.id,
            type: 'task_completed',
            title: 'Task Completed',
            body: `${completerName} completed "${taskTitle}"`,
          }))
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: 'POST', headers: jsonHeaders, body: JSON.stringify(notifs),
          })
          notifs.forEach(n => triggerPush(n))
        }
      } catch (notifErr) {
        console.error('Failed to send completion notifications:', notifErr)
      }
    } catch (err) {
      console.error('Failed to mark task done:', err.message)
      addToast('Failed to mark task done.', 'error')
    }
  }

  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
  const getTasksByStatus = (status) => {
    return tasks
      .filter(task => task.status === status)
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
  }

  const completedTasks = tasks
    .filter(task => task.status === 'completed')
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))

  const handleAddTask = async (newTask) => {
    // Tasks created outside a board (e.g. from a member's task page, where
    // activeTab is still 'home') would otherwise be filed under a non-board id
    // and never show up anywhere. Fall back to a real board.
    // Main holds nothing of its own, so a task made while looking at it has to
    // land on a real board.
    const boardIds = new Set(tabs.filter(t => !t.type && t.id !== MAIN_BOARD.id).map(t => t.id))
    const targetBoard = boardIds.has(activeTab)
      ? activeTab
      : (tabs.find(t => !t.type)?.id || 'business')

    // The sides picked in the modal decide which boards the task lands on.
    // With none picked it just lives on the board it was made from, as before.
    const sides = newTask.sides || []
    const sideBoards = boardsForSides(sides)
    const boardList = sideBoards.length ? sideBoards : [targetBoard]
    // The home board is what requests and calendar links read, so keep it on
    // the board it was created from whenever that is one of the chosen sides.
    const homeBoard = boardList.includes(targetBoard) ? targetBoard : boardList[0]

    const task = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      board_id: homeBoard,
      sides,
      title: newTask.title,
      description: newTask.description || '',
      assignee: newTask.assignee || '',
      assignees: newTask.assignees || [],
      due_date: newTask.dueDate || '',
      mentor: newTask.mentor || '',
      status: newTask.status || 'todo',
      skills: newTask.skills || [],
      priority: newTask.priority || 'medium',
      assigned_by: username || '',
      created_at: new Date().toISOString().split('T')[0],
    }

    // Add to local state immediately (optimistic) + sync cache
    const localTask = mapTask(task)
    setTasksByTab(prev => {
      const updated = placeTask(prev, localTask)
      syncCache(updated)
      return updated
    })
    setIsModalOpen(false)
    setPrefillAssignee('')

    // Persist via REST
    try {
      // Whose task this is, so the server can keep it off everyone else's
      // screen. NULL means ours, matching how boards already read.
      if (sessionTeam) task.owner_team = sessionTeam
      await restInsert('tasks', task)
      // Everyone put on it hears about it, not just the first name.
      const told = task.assignees?.length ? task.assignees : [task.assignee]
      told.filter(Boolean).forEach(who => notifyAssignee(who, task.title))
      notifyLeadOfCoLeadAction({ actor: username, tags: functionTags, type: 'task', detail: task.title })
    } catch (err) {
      console.error('Failed to save task:', err.message)
      const msg = saveError(err, 'Failed to save task.')
      setTasksByTab(prev => {
        const updated = {}
        for (const boardId in prev) {
          updated[boardId] = prev[boardId].filter(t => t.id !== task.id)
        }
        syncCache(updated)
        return updated
      })
      addToast(msg, 'error')
    }
  }

  const handleClaimTask = async (taskId) => {
    // Optimistic update: assign to current user
    const prevTasks = tasksByTab[activeTab] || []
    setTasksByTab(prev => {
      const updated = {
        ...prev,
        [activeTab]: (prev[activeTab] || []).map(task =>
          task.id === taskId ? { ...task, assignee: username } : task
        ),
      }
      syncCache(updated)
      return updated
    })

    // Race-condition guard: only claim if still up for grabs
    try {
      const res = await fetch(`${REST_URL}/rest/v1/tasks?id=eq.${taskId}&assignee=eq.__up_for_grabs__`, {
        method: 'PATCH',
        headers: { ...REST_JSON, 'Prefer': 'return=representation' },
        body: JSON.stringify({ assignee: username }),
      })
      const data = res.ok ? await res.json() : []
      if (!res.ok || !data || data.length === 0) {
        setTasksByTab(prev => {
          const updated = { ...prev, [activeTab]: prevTasks }
          syncCache(updated)
          return updated
        })
        addToast(!res.ok ? 'Failed to claim task.' : 'Someone else already claimed this task.', 'error')
      } else {
        addToast('Task claimed!', 'success')
      }
    } catch (err) {
      setTasksByTab(prev => {
        const updated = { ...prev, [activeTab]: prevTasks }
        syncCache(updated)
        return updated
      })
      addToast('Failed to claim task.', 'error')
    }
  }

  // Leaving a task you are on.
  //
  // A lead does not ask permission for this. The request exists so somebody
  // cannot quietly drop work nobody notices — but a lead is the person who
  // would be approving it, and Lily filing one as Business Lead and then
  // having it approved is a round trip that decided nothing.
  //
  // So a lead puts the task straight back up for grabs, which is where an
  // unassigned task belongs and exactly what approving the request did.
  const handleLeaveTaskDirect = async (task) => {
    const prevTasks = tasksByTab[activeTab] || []
    setTasksByTab(prev => {
      const updated = {
        ...prev,
        [activeTab]: (prev[activeTab] || []).map(t =>
          t.id === task.id ? { ...t, assignee: UP_FOR_GRABS } : t),
      }
      syncCache(updated)
      return updated
    })
    try {
      const res = await fetch(`${REST_URL}/rest/v1/tasks?id=eq.${task.id}`, {
        method: 'PATCH',
        headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ assignee: UP_FOR_GRABS }),
      })
      const data = res.ok ? await res.json() : null
      if (!res.ok || !data || data.length === 0) throw new Error('no rows')
      addToast('Left the task — it is up for grabs.', 'success')
    } catch {
      setTasksByTab(prev => {
        const updated = { ...prev, [activeTab]: prevTasks }
        syncCache(updated)
        return updated
      })
      addToast('Could not leave the task.', 'error')
    }
  }

  const handleLeaveTaskRequest = async (task) => {
    // A lead leaves; everyone else asks.
    if (hasLeadTag) return handleLeaveTaskDirect(task)

    // Check for duplicate pending leave_task request
    const { data: existing } = await scopeQuery(supabase
      .from('requests')
      .select('id'))
      .eq('type', 'leave_task')
      .eq('status', 'pending')
      .eq('requested_by_user_id', user.id)
      .eq('board_id', activeTab)

    if (existing && existing.length > 0) {
      // Check if any match this exact task
      // We store task_id in data, so also check via data filter client-side
      const hasDupe = existing.some(r => true) // any pending leave_task from this user on this board
      if (hasDupe) {
        addToast('You already have a pending leave request on this board.', 'error')
        return
      }
    }

    const request = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      type: 'leave_task',
      data: {
        task_id: task.id,
        title: task.title,
        assignee: task.assignee,
      },
      requested_by: username,
      requested_by_user_id: user.id,
      status: 'pending',
      board_id: activeTab,
    }

    addToast('Leave request sent! A lead will review it.', 'success')
    try {
      await supabase.from('requests').insert(stampStored(request))
    } catch (err) {
      console.error('Error submitting leave request:', err)
    }
  }

  const handleRequestTask = async (newTask) => {
    setIsRequestModalOpen(false)
    const request = {
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      type: 'task',
      data: {
        title: newTask.title,
        description: newTask.description || '',
        assignee: newTask.assignee || '',
        dueDate: newTask.dueDate || '',
        status: newTask.status || 'todo',
        skills: newTask.skills || [],
      },
      requested_by: username,
      requested_by_user_id: user.id,
      status: 'pending',
      board_id: activeTab,
    }
    addToast('Request sent! A lead will review it.', 'success')
    try {
      await supabase.from('requests').insert(stampStored(request))
    } catch (err) {
      console.error('Error submitting request:', err)
    }
  }

  const handleEditTask = async (updatedTask) => {
    // An edit can add or drop a side, so the whole map is the rollback unit.
    const prevByTab = tasksByTab
    const oldTask = Object.values(prevByTab).flat().find(t => t.id === updatedTask.id)

    // Update UI immediately + sync cache
    setTasksByTab(prev => {
      const updated = placeTask(prev, updatedTask)
      syncCache(updated)
      return updated
    })
    setEditingTask(null)

    try {
      await restUpdate('tasks', `id=eq.${updatedTask.id}`, {
        title: updatedTask.title,
        description: updatedTask.description || '',
        assignee: updatedTask.assignee || '',
        assignees: updatedTask.assignees || [],
        due_date: updatedTask.dueDate || '',
        mentor: updatedTask.mentor || '',
        status: updatedTask.status || 'todo',
        skills: updatedTask.skills || [],
        priority: updatedTask.priority || 'medium',
        sides: updatedTask.sides || [],
        // Keep the home board pointing somewhere the task actually is, so the
        // request and calendar links that read board_id still land on it.
        ...(updatedTask.boardIds?.length && !updatedTask.boardIds.includes(updatedTask.boardId)
          ? { board_id: updatedTask.boardIds[0] }
          : {}),
      })
      // Only people who weren't already on it get told, so an edit that
      // changes the due date doesn't re-notify the whole list.
      const before = new Set(oldTask?.assignees?.length
        ? oldTask.assignees
        : [oldTask?.assignee].filter(Boolean))
      const after = updatedTask.assignees?.length
        ? updatedTask.assignees
        : [updatedTask.assignee].filter(Boolean)
      after.filter(who => who && !before.has(who))
        .forEach(who => notifyAssignee(who, updatedTask.title))
    } catch (err) {
      console.error('Failed to update task:', err.message)
      const msg = saveError(err, 'Failed to update task.')
      setTasksByTab(() => {
        syncCache(prevByTab)
        return prevByTab
      })
      addToast(msg, 'error')
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return

    // Save for rollback
    const prevTasks = tasksByTab[activeTab] || []

    // Optimistic UI update — remove immediately
    setTasksByTab(prev => {
      const updated = {
        ...prev,
        [activeTab]: (prev[activeTab] || []).filter(task => task.id !== taskId),
      }
      syncCache(updated)
      return updated
    })

    try {
      await restDelete('tasks', `id=eq.${taskId}`)
    } catch (err) {
      console.error('Failed to delete task:', err.message)
      setTasksByTab(prev => {
        const updated = { ...prev, [activeTab]: prevTasks }
        syncCache(updated)
        return updated
      })
      addToast('Failed to delete task.', 'error')
    }
  }

  // Named columns in the order you'd read them, rather than a dump of the
  // task object — this file is meant to be opened in Sheets or Excel.
  const handleExport = () => {
    const currentTab = tabs.find(t => t.id === activeTab)
    const progress = (status) => {
      if (status === 'todo') return 'To Do'
      if (status === 'done' || status === 'completed') return 'Done'
      return `${status}%`
    }
    const rows = tasks.map(t => ({
      Title: t.title || '',
      Description: t.description || '',
      Assignee: (t.assignees?.length ? t.assignees : [t.assignee])
        .filter(Boolean).map(assigneeLabel).join(', '),
      Sides: (t.sides || []).map(k => SIDES.find(x => x.key === k)?.label || k).join(', '),
      Progress: progress(t.status),
      Priority: t.priority || '',
      'Due Date': t.dueDate || '',
      Mentor: t.mentor || '',
      'Assigned By': t.assignedBy || '',
      Skills: (t.skills || []).join(', '),
      Board: currentTab?.name || '',
    }))
    downloadRowsCSV(rows, csvName(currentTab?.name || 'tasks'))
  }

  const handleImport = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target.result
      const Papa = await import('papaparse')
      const result = Papa.default.parse(text, {
        header: true,
        skipEmptyLines: true,
      })
      const importedTasks = result.data.map(task => ({
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        board_id: activeTab,
        title: task.title || '',
        description: task.description || '',
        assignee: task.assignee || '',
        due_date: task.dueDate || '',
        status: task.status || 'todo',
        skills: task.skills ? task.skills.split(';') : [],
        created_at: task.createdAt || new Date().toISOString().split('T')[0],
      }))

      if (importedTasks.length > 0) {
        await restInsert('tasks', importedTasks)
        // Update local state directly - realtime handler deduplicates
        setTasksByTab(prev => ({
          ...prev,
          [activeTab]: [...(prev[activeTab] || []), ...importedTasks.map(mapTask)],
        }))
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const currentTabName = tabs.find(t => t.id === activeTab)?.name || 'Board'
  // A real board, not one of the system pages — those have no type set.
  const isBoardTab = !tabs.find(t => t.id === activeTab)?.type

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleMusicStart = useCallback((audio) => {
    audioRef.current = audio
    setIsPlaying(true)
    setMusicStarted(true)
    audio.addEventListener('ended', () => setIsPlaying(false))
  }, [])

  const toggleMusic = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
      setIsPlaying(true)
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  // Move a task between columns without dragging (drag is rough on touch).
  const moveTask = async (taskId, newStatus) => {
    setTasksByTab(prev => {
      const updated = {
        ...prev,
        [activeTab]: (prev[activeTab] || []).map(t => t.id === taskId ? { ...t, status: newStatus } : t),
      }
      syncCache(updated)
      return updated
    })
    setViewTask(prev => prev && prev.id === taskId ? { ...prev, status: newStatus } : prev)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(completionFields(newStatus)),
      })
    } catch (err) { console.error('Failed to move task:', err) }
  }

  // You move the tasks you're responsible for. Leads move anything.
  //
  // "Yours" has to cover every way a task reaches you, or this repeats the old
  // bug where nobody could move a task given to Everyone or to a whole side:
  // your name among the assignees, the single assignee field, Everyone, Up for
  // Grabs, or a side your roles put you on.
  const mySides = sidesForTags(functionTags)
  const isMyTask = (task) => {
    if (!task || !username) return false
    const names = task.assignees?.length ? task.assignees : [task.assignee].filter(Boolean)
    if (names.some(n => n && n.toLowerCase() === username.toLowerCase())) return true
    if (names.includes(EVERYONE) || names.includes(UP_FOR_GRABS)) return true
    return (task.sides || []).some(sd => mySides.includes(sd))
  }
  const canDragTask = (task) => canDragAnyTask || (canDragOwnTask && isMyTask(task))

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A] flex flex-col items-center justify-center gap-4">
        <img src="/ScrumLogo-transparent.png" alt="Loading" className="w-20 h-20 animate-spin-slow" />
        <p className="text-gray-500 text-lg animate-pulse font-semibold">{radicalMsg}</p>
      </div>
    )
  }

  // Following a reset link signs the user in, so this has to come before the
  // !user check or the Set New Password screen can never show.
  if (passwordRecovery) {
    return <LoginScreen sessionExpired={sessionExpired} />
  }

  if (!user) {
    if (landingChoice === 'login') {
      return <LoginScreen sessionExpired={sessionExpired} linkError={authLinkError} onBack={() => setLandingChoice(null)} />
    }
    if (landingChoice === 'team-login') {
      return <LoginScreen sessionExpired={sessionExpired} onBack={() => setLandingChoice(null)} />
    }
    if (landingChoice === 'team-info') {
      return <TeamInfoPage onBack={() => setLandingChoice(null)} />
    }
    return (
      <LandingScreen
        onGetRadical={() => setLandingChoice('login')}
        onTeamLogin={() => setLandingChoice('team-login')}
        onRadicalRundown={() => setLandingChoice('team-info')}
      />
    )
  }

  if (mustChangePassword) {
    return <ForcePasswordChange updatePassword={updatePassword} />
  }

  return (
    <>
      {isLoading && !effectiveIsTeam && <LoadingScreen onComplete={handleLoadingComplete} onMusicStart={handleMusicStart} />}
      {/* The sign-in can't be renewed (lib/restHeaders.js). Without this the
          app keeps running on the public key and every screen comes back
          empty, which looks like lost data rather than a sign-in problem. */}
      {sessionLost && (
        <div className="fixed top-0 inset-x-0 z-[200] flex justify-center p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-3 bg-white border border-amber-300 shadow-lg rounded-xl px-4 py-3 text-sm text-gray-700 max-w-md">
            <span className="flex-1">Your sign-in expired, so nothing new can load. Sign in again to see your team's data.</span>
            <button onClick={() => logout()} className="shrink-0 px-3 py-1.5 rounded-lg bg-brand-yellow hover:bg-brand-yellow-dark font-semibold">
              Sign in again
            </button>
          </div>
        </div>
      )}
      {/* Guests and kiosk accounts aren't people we send notifications to. */}
      {features.popups && !isLoading && !effectiveIsTeam && (<><ChangelogPopup /><MeetingRecapPopup /><BirthdayConfetti />{!isGuest && features.notifications && <NotificationNudge />}</>)}
      {viewTask && (
        <TaskDetailModal
          task={viewTask}
          onClose={() => setViewTask(null)}
          onEdit={canEditContent ? () => { setEditingTask(viewTask); setViewTask(null) } : null}
          onMove={canDragTask(viewTask) ? (st) => moveTask(viewTask.id, st) : null}
        />
      )}
      {features.popups && import.meta.env.DEV && showPulse && user?.id && <DailyPulsePopup userId={user.id} onClose={() => setShowPulse(false)} onComplete={() => setShowPulse(false)} />}
      {/* Being picked to rate a decision matrix takes over the screen until
          it's done — same reason it gets a notification. */}
      {features.popups && !isLoading && !effectiveIsTeam && !isGuest && <MatrixRatingRequired />}
    <div className={`min-h-screen bg-gradient-to-br from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A] flex flex-col relative ${isLoading && !effectiveIsTeam ? 'hidden' : ''}`}>
      {loadError && (
        <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 text-sm text-center flex items-center justify-center gap-3">
          <span>{loadError}</span>
          <button
            onClick={loadData}
            className="px-3 py-1 bg-red-200 hover:bg-red-300 rounded-lg text-red-800 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      {/* Role change celebration modal */}
      <RoleChangeModal alert={roleChangeAlert} onDismiss={dismissRoleChangeAlert} />

      <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <Sidebar
        tabs={liveDay ? tabs.filter(t => LIVE_DAY_TABS.includes(t.id)) : tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddTab={handleAddTab}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isPlaying={isPlaying}
        onToggleMusic={toggleMusic}
        musicStarted={musicStarted}
        onlineUsers={onlineUsers}
        isTeamAccount={effectiveIsTeam}
        compDayLock={compDayLock}
        liveDay={liveDay}
      />


      {/* Main Content — inside a boundary so one broken screen shows an
          error with a way out instead of blanking the whole app. */}
      <ScreenBoundary tab={activeTab} onHome={() => setActiveTab('home')}>
      {viewPersonTasks ? (
        <PersonTasksView
          name={viewPersonTasks}
          onBack={() => setViewPersonTasks(null)}
          onOpenTask={(t) => {
            // Same detail popup Home uses — one task view everywhere. The person
            // page stays mounted underneath, so closing lands back on it.
            setCameFromPerson(viewPersonTasks)
            setViewTask({
              id: t.id,
              board_id: t.board_id,
              title: t.title,
              description: t.description,
              assignee: t.assignee,
              dueDate: t.due_date,
              mentor: t.mentor,
              assignedBy: t.assigned_by,
              status: t.status,
              skills: t.skills || [],
              priority: t.priority,
            })
          }}
          onAddTask={() => { setPrefillAssignee(viewPersonTasks); setCameFromPerson(viewPersonTasks); setIsModalOpen(true) }}
        />
      ) : !hasAccess(activeTab, tier, effectiveIsTeam, blockedTabs, effectiveFullAccess)
          && !(activeTab === 'special-controls' && OPEN_SPECIAL_VIEWS.includes(specialView)) ? (
        <RestrictedAccess feature={tabs.find(t => t.id === activeTab)?.name || activeTab} />
      ) : activeTab === 'home' ? (
        // A visiting team gets the cut-down dashboard. A sister team runs the
        // whole app, so it gets the real one — asking for a dashboard that
        // "looks the same" means this page, not a second copy of it kept in
        // step by hand. What that team should not see (Radical's own season
        // goals) HomeView decides for itself from the team number.
        liveDay ? <CompDayBoard day={liveDay} onTabChange={setActiveTab} canPause={isCofounder} />
        : (effectiveIsTeam && !effectiveFullAccess) ? <TeamHomeView onTabChange={setActiveTab} />
        : <HomeView onTabChange={setActiveTab} onOpenTask={openTaskDetail} onOpenSpecial={(v) => { setSpecialView(v); setSpecialFrom('home'); setActiveTab('special-controls') }} />
      ) : activeTab === 'sw-design' ? (
        <WorkingOnIt title="Software Design" />
      ) : activeTab === 'sw-programming' ? (
        <WorkingOnIt title="Programming" />
      ) : activeTab === 'sw-io' ? (
        <WorkingOnIt title="Robot I/O" />
      ) : activeTab === 'unfinished-tabs' && import.meta.env.DEV ? (
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
            <div className="px-4 py-3 pl-14 flex items-center justify-between text-gray-200">
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
                  Unfinished Tabs
                </h1>
                <p className="text-sm text-gray-300">Hidden from the team until they're built</p>
              </div>
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4">
            <div className="max-w-md mx-auto grid grid-cols-2 gap-2">
              {[
                ['log-reach', 'Log Reach'], ['portfolio', 'Portfolio'],
                ['budget-tracker', 'Budget Tracker'], ['fundraising', 'Fundraising'],
                ['financial-history', 'Financial History'], ['comms-announcements', 'Announcements'],
                ['content-studio', 'Content Studio'], ['website-manager', 'Website'],
                ['marketing', 'Marketing'], ['hw-design', 'Design'],
                ['hw-fabrication', 'Fabrication'], ['hw-assembly', 'Assembly'],
                ['hw-electrical', 'Electrical'], ['sw-design', 'Software Design'],
                ['sw-programming', 'Programming'], ['sw-io', 'Robot I/O'],
                ['bug-tracker', 'Bug Tracker'], ['testing', 'Testing'],
                ['design-matrix', 'Decision Matrix'], ['expense-requests', 'Expense Requests'],
                ['scouting', 'Scouting Form'],
                ['schedule', 'Match Schedule'],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-3 py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-100 shadow-sm hover:bg-brand-blue/20 text-gray-600 transition-colors text-left"
                >
                  {label}
                </button>
              ))}
            </div>
          </main>
        </div>
      ) : activeTab === 'testing' ? (
        <TestingDashboard onBack={() => setActiveTab('home')} />
      ) : activeTab === 'design-matrix' ? (
        <DesignMatrix onBack={() => setActiveTab('home')} />
      ) : activeTab === 'bug-tracker' ? (
        <WorkingOnIt title="Bug Tracker" />
      ) : activeTab === 'hw-design' ? (
        <WorkingOnIt title="Design" />
      ) : activeTab === 'hw-fabrication' ? (
        <WorkingOnIt title="Fabrication" />
      ) : activeTab === 'hw-assembly' ? (
        <WorkingOnIt title="Assembly" />
      ) : activeTab === 'hw-electrical' ? (
        <WorkingOnIt title="Electrical" />

      ) : activeTab === 'comms-announcements' ? (
        <WorkingOnIt title="Announcements" />
      ) : activeTab === 'content-studio' ? (
        <WorkingOnIt title="Content Studio" />
      ) : activeTab === 'website-manager' ? (
        <WorkingOnIt title="Website" />
      ) : activeTab === 'marketing' ? (
        <WorkingOnIt title="Marketing" />
      ) : activeTab === 'budget-tracker' ? (
        <WorkingOnIt title="Budget Tracker" />
      ) : activeTab === 'fundraising' ? (
        <WorkingOnIt title="Fundraising Progress" />
      ) : activeTab === 'financial-history' ? (
        <WorkingOnIt title="Financial History" />
      ) : activeTab === 'expense-requests' ? (
        <ExpenseRequests />
      ) : activeTab === 'log-reach' ? (
        <WorkingOnIt title="Log Reach" />
      ) : activeTab === 'portfolio' ? (
        <WorkingOnIt title="Portfolio" />
      ) : activeTab === 'pit-scouting' ? (
        <PitScoutingForm liveDay={liveDay} onDone={liveDay ? () => setActiveTab('home') : undefined} />
      ) : activeTab === 'scouting' ? (
        <ScoutingForm liveDay={liveDay} onDone={liveDay ? () => setActiveTab('home') : undefined} />
      ) : activeTab === 'schedule' ? (
        <ScoutingSchedule liveDay={liveDay} />
      ) : activeTab === 'team-scouting-data' ? (
        <TeamScoutingData />
      ) : activeTab === 'tasks' ? (
        <TasksView tasksByTab={tasksByTab} tabs={tabs} />
      ) : activeTab === 'workshops' ? (
        <WorkshopIdeas />
      ) : activeTab === 'ai-manual' ? (
        <AIManual />
      ) : activeTab === 'org-chart' ? (
        <OrgChart onViewProfile={(profileId) => { setViewingProfileId(profileId); setActiveTab('profile') }} />
      ) : activeTab === 'suggestions' ? (
        <SuggestionsView />
      ) : activeTab === 'calendar' ? (
        <CalendarView
          tabs={tabs}
          tasksByTab={tasksByTab}
          onOpenTask={(task) => {
            if (task?.board_id) setActiveTab(task.board_id)
            setEditingTask(task)
          }}
        />
      ) : activeTab === 'user-management' ? (
        <UserManagement onViewProfile={(id) => { setViewingProfileId(id); setProfileReturnTab('user-management'); setActiveTab('profile') }} />
      ) : activeTab === 'requests' ? (
        <RequestsView tabs={tabs} />
      ) : activeTab === 'profile' ? (
        <ProfileView
          viewingProfileId={viewingProfileId}
          onClearViewing={() => { setViewingProfileId(null); if (profileReturnTab) { setActiveTab(profileReturnTab); setProfileReturnTab(null) } }}
        />
      ) : activeTab === 'settings' ? (
        <SettingsView />
      ) : activeTab === 'data' ? (
        <ScoutingData />
      ) : activeTab === 'team-growth' ? (
        <TeamGrowthView />
      ) : activeTab === 'role-spec' && import.meta.env.DEV ? (
        <RoleSpec />
      ) : activeTab === 'logs' || activeTab.startsWith('logs-') ? (
        <LogsView log={activeTab} />
      ) : activeTab === 'notebook' ? (
        <EngineeringNotebook />
      ) : activeTab === 'attendance' ? (
        showSessions
          ? <AttendanceManager onBack={() => setShowSessions(false)} />
          : <AttendanceView onOpenSessions={() => setShowSessions(true)} />
      ) : activeTab === 'chat-all' ? (
        <QuickChat channel="all" />
      ) : activeTab === 'chat-alliances' ? (
        <AllianceHubs />
      ) : activeTab === 'chat-leagues' ? (
        <QuickChat channel="leagues" />
      ) : activeTab === 'comp-day' ? (
        <CompDayView onBack={() => setActiveTab('special-controls')} />
      ) : activeTab === 'special-controls' ? (
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
            <div className="px-4 py-3 ml-14 flex items-center justify-between text-gray-200">
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
                  Special Controls
                </h1>
              </div>
              <NotificationBell />
            </div>
          </header>
          {specialView === 'absence' ? (
            <AbsenceNotice onBack={closeSpecial} />
          ) : specialView === 'quotes' ? (
            <QuotesManager onBack={closeSpecial} />
          ) : specialView === 'attendance' ? (
            <AttendanceManager onBack={closeSpecial} />
          ) : specialView === 'interested-teams' ? (
            <InterestedTeams onBack={() => setSpecialView(null)} canDelete={isCofounder} />

          ) : specialView === 'team-survey' ? (
            <TeamSurveyResponses onBack={() => setSpecialView(null)} />
          ) : specialView === 'design-matrix' ? (
            <DesignMatrix onBack={closeSpecial} />
          ) : specialView === 'meeting-stats' ? (
            <MeetingStatsView onBack={closeSpecial} />
          ) : specialView === 'team-pulse' && import.meta.env.DEV ? (
            <TeamPulseDashboard onBack={() => setSpecialView(null)} />
          ) : (
            <div className="flex-1 p-6">
              <div className="max-w-md mx-auto space-y-6">
                {/* Main */}
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Main</h2>
                  <div className="grid gap-3">
                    {import.meta.env.DEV && hasLeadTag && (
                      <div className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm">
                        <button onClick={() => setSpecialView('team-pulse')} className="text-left w-full hover:opacity-80 transition-opacity">
                          <span className="text-lg font-semibold text-gray-700">Team Pulse</span>
                          <p className="text-sm text-gray-400 mt-1">Anonymous mood, focus, and frustration trends</p>
                        </button>
                        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600">Daily Pulse check-in</p>
                            <p className="text-xs text-gray-400">{appSettings.teamPulseEnabled === false ? 'Off — no one gets the popup' : 'On — members get the daily popup'}</p>
                          </div>
                          <button
                            onClick={() => updateAppSettings({ teamPulseEnabled: appSettings.teamPulseEnabled === false })}
                            role="switch"
                            aria-checked={appSettings.teamPulseEnabled !== false}
                            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${appSettings.teamPulseEnabled === false ? 'bg-gray-300' : 'bg-green-400'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${appSettings.teamPulseEnabled === false ? '' : 'translate-x-6'}`} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Business */}
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Business</h2>
                  <div className="grid gap-3">
                    {['Portfolio', 'Outreach'].map(label => (
                      <button
                        key={label}
                        className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm text-left opacity-60"
                        disabled
                      >
                        <span className="text-lg font-semibold text-gray-700">{label}</span>
                        <p className="text-sm text-gray-400 mt-1">Coming soon</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Technical */}
                {hasLeadTag && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Technical</h2>
                    <div className="grid gap-3">
                      <button
                        onClick={() => setSpecialView('design-matrix')}
                        className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-md hover:bg-white transition-all text-left"
                      >
                        <span className="text-lg font-semibold text-gray-700">Decision Matrix</span>
                        <p className="text-sm text-gray-400 mt-1">Compare designs, score options & pick a winner</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Modes */}
                {hasLeadTag && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Modes</h2>
                    <div className="grid gap-3">
                      <button
                        onClick={() => setActiveTab('comp-day')}
                        className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-md hover:bg-white transition-all text-left"
                      >
                        <span className="text-lg font-semibold text-gray-700">🏁 Competition Day</span>
                        <p className="text-sm text-gray-400 mt-1">Plan roles, manage blocks, track scouting accountability</p>
                      </button>
                      {['SWOT Mode', 'Scouting Mode', 'Meeting Stats'].map(label => (
                        <button
                          key={label}
                          className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm text-left opacity-60"
                          disabled
                        >
                          <span className="text-lg font-semibold text-gray-700">{label}</span>
                          <p className="text-sm text-gray-400 mt-1">Coming soon</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Co-Founders */}
                {isCofounder && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Co-Founders</h2>
                    <div className="grid gap-3">
                      <button
                        onClick={() => setSpecialView('interested-teams')}
                        className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-md hover:bg-white transition-all text-left"
                      >
                        <span className="text-lg font-semibold text-gray-700">Interested Teams</span>
                        <p className="text-sm text-gray-400 mt-1">Teams that want to use the app</p>
                      </button>
                      <button
                        onClick={() => setSpecialView('team-survey')}
                        className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-md hover:bg-white transition-all text-left"
                      >
                        <span className="text-lg font-semibold text-gray-700">Team Survey Responses</span>
                        <p className="text-sm text-gray-400 mt-1">View feedback from team accounts</p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-brand-black/95 backdrop-blur-sm shadow-md border-b border-brand-yellow/40 sticky top-0 z-10">
          <div className="px-4 py-4 flex items-center justify-between text-gray-200">
            <div className="flex items-center gap-4 ml-14 text-gray-200">
              <div>
                <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
                  Limitless Scrum
                </h1>
                <p className="text-sm text-gray-300">{currentTabName}</p>
                {/* Renaming and removing live with the board you're looking at,
                    rather than as a bin on every row of the sidebar where it's
                    easy to hit by accident. Leads and mentors only. */}
                {isBoardTab && canEditContent && !tabs.find(t => t.id === activeTab)?.readOnly && (
                  <div className="flex items-center gap-3 mt-0.5 text-gray-200">
                    <button
                      onClick={() => {
                        const name = window.prompt('Rename this board', currentTabName)
                        if (name && name.trim() && name.trim() !== currentTabName) handleRenameTab(activeTab, name)
                      }}
                      className="text-[11px] font-semibold text-gray-400 hover:text-gray-200"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteTab(activeTab)}
                      className="text-[11px] font-semibold text-gray-400 hover:text-red-500"
                    >
                      Remove board
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center text-gray-200">
              <NotificationBell />
              {canReviewRequests && <RequestsBadge type="task" boardId={activeTab} />}
              {canImport && (
                <label className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-blue hover:bg-brand-blue-dark rounded-lg cursor-pointer transition-colors">
                  <Upload size={18} />
                  <span className="hidden sm:inline">Import</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleImport}
                    className="hidden"
                  />
                </label>
              )}
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-silver hover:bg-brand-silver-dark rounded-lg transition-colors"
              >
                <Download size={18} />
                <span className="hidden sm:inline">Export</span>
              </button>
              {canEditContent ? (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-yellow hover:bg-brand-yellow-dark rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Add Task</span>
                </button>
              ) : canRequestContent ? (
                <button
                  onClick={() => setIsRequestModalOpen(true)}
                  className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-blue hover:bg-brand-blue-dark rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Request Task</span>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Board */}
        <main className="flex-1 p-4 overflow-x-auto">

          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 min-w-[300px]">
              {COLUMNS.map(column => (
                <div key={column.id} className="flex flex-col">
                  <div className={`${column.color} rounded-t-lg px-4 py-2 font-semibold text-gray-700`}>
                    {column.title}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({getTasksByStatus(column.id).length})
                    </span>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 min-h-[200px] p-2 rounded-b-lg transition-colors ${
                          snapshot.isDraggingOver
                            ? 'bg-white/80'
                            : 'bg-white/50'
                        }`}
                      >
                        {getTasksByStatus(column.id).map((task, index) => (
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={index}
                            isDragDisabled={!canDragTask(task)}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                              >
                                <TaskCard
                                  task={task}
                                  isDragging={snapshot.isDragging}
                                  onOpen={() => setViewTask(task)}
                                  onEdit={() => setEditingTask(task)}
                                  onDelete={() => handleDeleteTask(task.id)}
                                  canEdit={canEditContent}
                                  onClaim={handleClaimTask}
                                  onLeaveTask={handleLeaveTaskRequest}
                                  leaveIsImmediate={hasLeadTag}
                                  onMarkDone={handleMarkDone}
                                  currentUser={username}
                                  isGuest={isGuest}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>

          {/* Completed tasks — archived out of the board via "Mark Done" */}
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted(prev => !prev)}
              className="flex items-center gap-2 px-4 py-2 bg-white/60 hover:bg-white/90 rounded-lg font-semibold text-gray-700 transition-colors"
            >
              <ChevronRight size={16} className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
              <CheckCircle size={16} className="text-green-500" />
              Completed
              <span className="text-sm font-normal text-gray-500">({completedTasks.length})</span>
            </button>

            {showCompleted && (
              completedTasks.length === 0 ? (
                <p className="text-sm text-gray-400 mt-3 ml-2">No completed tasks yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
                  {completedTasks.map(task => (
                    <div
                      key={task.id}
                      className="bg-white rounded-lg p-3 shadow-sm border-l-4 border-l-green-400"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-medium text-gray-800 text-sm">{task.title}</h3>
                        {canEditContent && (
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-gray-300 hover:text-red-400 shrink-0"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        {task.assignee === '__everyone__' ? (
                          <span className="flex items-center gap-1 text-brand-blue-dark font-medium">👥 Everyone</span>
                        ) : isTeamAssignee(task.assignee) ? (
                          <span className="flex items-center gap-1 text-brand-blue-dark font-medium">{teamLabel(task.assignee)}</span>
                        ) : task.assignee && task.assignee !== '__up_for_grabs__' ? (
                          <span className="flex items-center gap-1">
                            <User size={11} />
                            {task.assignee}
                          </span>
                        ) : null}
                        {/* When it was finished — not when it was due. The due
                            date is in the tooltip, and how it compared is the
                            note beside it. Tasks done before the stamp existed
                            have no date to show. */}
                        {task.completedAt && (
                          <span className="flex items-center gap-1" title={task.dueDate ? `Was due ${task.dueDate}` : undefined}>
                            <CheckCircle size={11} className="text-green-500" />
                            Done {prettyDone(task.completedAt)}
                            {daysLate(task.dueDate, task.completedAt) > 0 && (
                              <span className="text-red-400">· {latenessLabel(daysLate(task.dueDate, task.completedAt))}</span>
                            )}
                            {daysLate(task.dueDate, task.completedAt) < 0 && (
                              <span className="text-green-600">· {latenessLabel(daysLate(task.dueDate, task.completedAt))}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </main>
      </div>
      )}
      </ScreenBoundary>

      {/* Add/Edit Task Modal */}
      {(isModalOpen || editingTask) && (
        <TaskModal
          task={editingTask || (prefillAssignee ? { assignee: prefillAssignee } : null)}
          onSave={editingTask ? handleEditTask : handleAddTask}
          onClose={() => {
            setIsModalOpen(false)
            setEditingTask(null)
            setPrefillAssignee('')
          }}
          isLead={canEditContent}
          isTeam={effectiveIsTeam}
          backToPerson={cameFromPerson}
          onBackToPerson={() => {
            setIsModalOpen(false)
            setEditingTask(null)
            setPrefillAssignee('')
            setViewPersonTasks(cameFromPerson)
            setCameFromPerson('')
          }}
        />
      )}

      {/* Request Task Modal (non-leads) */}
      {isRequestModalOpen && (
        <TaskModal
          task={null}
          onSave={handleRequestTask}
          onClose={() => setIsRequestModalOpen(false)}
          requestMode
        />
      )}



      </div>
    </div>
    </>
  )
}

export default App
