import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { restHeaders } from './restHeaders'

// What the app is made of, and which parts are switched on.
//
// The Scrum boards are the app. Everything else is an optional feature with a
// switch in Settings, and every feature starts switched off. A page whose
// feature is off has no link in the sidebar, and opening it any other way
// (a saved tab, a notification) lands on the boards instead.
//
// The switches are the team's, not the device's: one document in the
// database (scouting_schedule, id 'feature_switches', the same place the
// team-wide app settings live), so every account on every computer sees the
// same app, and a switch flipped on one computer flips on the others as it
// happens. This device keeps a copy so the menu is right before the first
// answer arrives.
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

const KEY = 'scrum-features'
const DEFAULTS = Object.fromEntries(FEATURES.map(f => [f.key, f.key === 'boards']))
const TAB_TO_FEATURE = Object.fromEntries(FEATURES.flatMap(f => (f.tabs || []).map(t => [t, f.key])))

export function getFeatures() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...DEFAULTS, ...saved, boards: true }
  } catch {
    return { ...DEFAULTS }
  }
}

const DOC_ID = 'feature_switches'
const url = import.meta.env.VITE_SUPABASE_URL

const listeners = new Set()
function apply(saved) {
  const next = { ...DEFAULTS, ...(saved || {}), boards: true }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  listeners.forEach(l => l())
}

// Read the team's switches once and keep listening, for as long as the app is
// open. Started by the first screen that asks; again after signing in, since
// before that the database answers nobody.
let syncing = null
let channel = null
async function startSync() {
  if (syncing) return syncing
  syncing = (async () => {
    try {
      const res = await fetch(`${url}/rest/v1/scouting_schedule?id=eq.${DOC_ID}&select=data`, { headers: restHeaders() })
      if (!res.ok) { syncing = null; return }
      const rows = await res.json()
      if (rows[0]?.data) apply(rows[0].data)
    } catch { syncing = null; return }
    if (!channel) {
      channel = supabase
        .channel('feature-switches')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scouting_schedule', filter: `id=eq.${DOC_ID}` }, (p) => {
          if (p.new?.data) apply(p.new.data)
        })
        .subscribe()
    }
  })()
  return syncing
}
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') { syncing = null; startSync() }
})

// For the whole team. Settings only offers the switches to leads.
export async function setFeature(key, on) {
  if (key === 'boards') return
  const next = { ...getFeatures(), [key]: !!on }
  apply(next)
  try {
    await fetch(`${url}/rest/v1/scouting_schedule`, {
      method: 'POST',
      headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates, return=minimal' }),
      body: JSON.stringify({ id: DOC_ID, data: next }),
    })
  } catch { /* offline: this device keeps it, and the next change carries it */ }
}

export function useFeatures() {
  const [features, setFeatures] = useState(getFeatures)
  useEffect(() => {
    const update = () => setFeatures(getFeatures())
    listeners.add(update)
    window.addEventListener('storage', update)
    startSync()
    return () => { listeners.delete(update); window.removeEventListener('storage', update) }
  }, [])
  return features
}

// Is this tab open with these switches? Any tab no feature claims is a board.
export function tabOn(features, tabId) {
  if (!tabId || ALWAYS_TABS.includes(tabId)) return true
  const key = TAB_TO_FEATURE[tabId]
  return !key || !!features[key]
}
