import { useMemo } from 'react'
import { teamDoc } from './teamDoc'

// What the app is made of, and which parts are switched on.
//
// The Scrum boards are the app. Everything else is an optional feature with a
// switch in Settings, and every feature starts switched off. A page whose
// feature is off has no link in the sidebar, and opening it any other way
// (a saved tab, a notification) lands on the boards instead.
//
// The switches are the team's, not the device's (teamDoc.js): every account
// on every computer sees the same app, and a switch flipped on one computer
// flips on the others as it happens.
export const FEATURES = [
  { key: 'boards', label: 'Scrum boards', desc: 'Boards, tasks and the Main view. Always on.', locked: true, tabs: ['tasks'] },
  { key: 'home', label: 'Home dashboard', desc: 'The home page with goals, quick links and your tasks.', tabs: ['home'] },
  { key: 'calendar', label: 'Calendar', desc: 'Team calendar and events.', tabs: ['calendar'] },
  { key: 'attendance', label: 'Attendance', desc: 'Check-ins and attendance records.', tabs: ['attendance'] },
  { key: 'data', label: 'Data & team growth', desc: 'RadRank, team growth and role stats.', tabs: ['data', 'team-growth', 'role-spec'] },
  { key: 'scouting', label: 'Scouting & competition day', desc: 'Match and pit scouting, scouting data, schedule and the competition day board.', tabs: ['scouting', 'pit-scouting', 'team-scouting-data', 'comp-day', 'schedule'] },
  { key: 'logs', label: 'Logs', desc: 'Outreach, expense and mentor logs.', tabs: ['logs', 'logs-outreach', 'logs-expenses', 'logs-mentor', 'log-reach'] },
  { key: 'workshops', label: 'Workshops', desc: 'Workshop sign-ups and sessions.', tabs: ['workshops'] },
  { key: 'notebook', label: 'Engineering notebook', desc: 'Notebook entries and the gallery.', tabs: ['notebook'] },
  { key: 'specialControls', label: 'Special Controls & role pages', desc: 'Lead controls and the business, comms, hardware and software pages.',
    tabs: ['special-controls', 'unfinished-tabs', 'portfolio', 'budget-tracker', 'fundraising', 'financial-history', 'expense-requests',
      'comms-announcements', 'content-studio', 'website-manager', 'marketing', 'hw-design', 'hw-fabrication', 'hw-assembly',
      'hw-electrical', 'testing', 'design-matrix', 'sw-design', 'sw-programming', 'sw-io', 'bug-tracker'] },
  { key: 'aiManual', label: 'AI manual', desc: 'Ask questions about the game manual.', tabs: ['ai-manual'] },
  { key: 'chat', label: 'Chat', desc: 'Team, alliance and league chat.', tabs: ['chat-all', 'chat-alliances', 'chat-leagues'] },
  { key: 'orgChart', label: 'Org chart', desc: 'Who does what on the team.', tabs: ['org-chart'] },
  { key: 'suggestions', label: 'Suggestions', desc: 'Ideas for the app.', tabs: ['suggestions'] },
  { key: 'notifications', label: 'Notifications', desc: 'The bell, requests and notification reminders.', tabs: ['requests'] },
  { key: 'popups', label: 'Pop-ups', desc: "What's New, meeting recaps, birthdays, the Daily Pulse and rating reminders." },
  { key: 'onlineNow', label: 'Online now', desc: 'Who else has the app open, at the bottom of the sidebar.' },
  { key: 'music', label: 'Music', desc: 'Intro music and the play button.' },
  { key: 'intro', label: 'Intro screen', desc: 'The "Tap to enter" screen when the app opens.' },
]

// Pages every account keeps whatever is switched off: where the switches are,
// and the account itself.
const ALWAYS_TABS = ['settings', 'profile', 'user-management']

const DEFAULTS = Object.fromEntries(FEATURES.map(f => [f.key, f.key === 'boards']))
const TAB_TO_FEATURE = Object.fromEntries(FEATURES.flatMap(f => (f.tabs || []).map(t => [t, f.key])))

const doc = teamDoc('feature_switches', 'scrum-features')
const withDefaults = (saved) => ({ ...DEFAULTS, ...saved, boards: true })

export const getFeatures = () => withDefaults(doc.get())

// For the whole team. Settings only offers the switches to leads.
export function setFeature(key, on) {
  if (key === 'boards') return
  return doc.set({ ...getFeatures(), [key]: !!on })
}

export function useFeatures() {
  const saved = doc.use()
  return useMemo(() => withDefaults(saved), [saved])
}

// Is this tab open with these switches? Any tab no feature claims is a board.
export function tabOn(features, tabId) {
  if (!tabId || ALWAYS_TABS.includes(tabId)) return true
  const key = TAB_TO_FEATURE[tabId]
  return !key || !!features[key]
}
