// Role dashboards & data trackers.
//
// Each role has a set of trackers. A tracker has:
//   id, role, name, type, visibility, value, (unit?, target?)
//   type:        'number' | 'progress' | 'checklist' | 'note' | 'event'
//   visibility:  'public'  -> shown in the Data tab's role subtab (everyone)
//                'role'    -> shown only on the dashboard (Home) of that role
//   value:       number (number/progress) | string (note) | [{text, done}] (checklist)
//                | {title, date, location, details} (event)
//
// Trackers are stored in one JSON doc so no new table/migration is needed.

// Bump this whenever SEED_TRACKERS gains new entries. On load, any seed whose id
// isn't in the saved doc gets appended once, then the doc records the new version
// so a tracker a lead later deletes stays deleted instead of coming back.
export const SEED_VERSION = 7

// Seed trackers that have been withdrawn. Removing an entry from SEED_TRACKERS is
// not enough — docs that already saved it would keep it forever — so these ids get
// stripped on load and never re-added.
//
// Event entry lives in its own tab, not on a role dashboard, so the dashboard no
// longer collects events.
// fin-*: Finance runs on the dated ledger (FinanceDashboard) now — its tiles
// derive from transactions instead of hand-typed numbers.
// com-*: Communications runs on its own board (CommsDashboard) now.
// cad-/asm-/wir-: hardware runs on the shared RobotDashboard now.
export const RETIRED_SEED_IDS = [
  'out-next', 'out-upcoming',
  'fin-budget', 'fin-raised', 'fin-expenses',
  'com-sponsors', 'com-posts', 'com-todo',
  'cad-parts', 'cad-todo', 'asm-progress', 'asm-subsystems', 'wir-progress', 'wir-todo',
  'prg-auto', 'prg-opmodes', 'prg-todo',
]

export const DASHBOARD_ROLES = [
  { role: 'Communications', side: 'business' },
  { role: 'Finance', side: 'business' },
  { role: 'Outreach', side: 'business' },
  { role: 'CAD', side: 'hardware' },
  { role: 'Assembly/Building', side: 'hardware' },
  { role: 'Wiring', side: 'hardware' },
  { role: 'Programming', side: 'software' },
  { role: 'Scouting', side: 'software' },
]

export const ROLE_NAMES = DASHBOARD_ROLES.map(r => r.role)

// Color per side (matches the org chart)
// Fills use the pastel brand tokens so dashboards read as part of the app rather
// than generic Tailwind. Text stays on a darker step — pastel on white doesn't
// clear contrast. `track` is a lighter step of `bar`'s own hue, since a gray
// unfilled track reads as "disabled". `tile` is the stat-tile wash.
export const SIDE_THEME = {
  business: {
    text: 'text-orange-700', chip: 'bg-brand-silver/40 text-orange-700',
    bar: 'bg-brand-silver-dark', track: 'bg-brand-silver/40',
    dot: 'bg-brand-silver-dark', tile: 'bg-brand-silver/[0.18]',
    rule: 'bg-brand-silver-dark/30', ring: 'border-brand-silver',
  },
  hardware: {
    text: 'text-blue-700', chip: 'bg-brand-blue/40 text-blue-700',
    bar: 'bg-brand-blue-dark', track: 'bg-brand-blue/40',
    dot: 'bg-brand-blue-dark', tile: 'bg-brand-blue/[0.18]',
    rule: 'bg-brand-blue-dark/30', ring: 'border-brand-blue',
  },
  software: {
    text: 'text-pink-700', chip: 'bg-brand-yellow/40 text-pink-700',
    bar: 'bg-brand-yellow-dark', track: 'bg-brand-yellow/40',
    dot: 'bg-brand-yellow-dark', tile: 'bg-brand-yellow/[0.18]',
    rule: 'bg-brand-yellow-dark/30', ring: 'border-brand-yellow',
  },
}

export const sideForRole = (role) => (DASHBOARD_ROLES.find(r => r.role === role)?.side) || 'business'

// Starter trackers — shown until leads customize them in-app.
export const SEED_TRACKERS = [
  // Communications has no seed trackers — see CommsDashboard.

  // Finance has no seed trackers — see FinanceDashboard (dated ledger).

  // Outreach
  { id: 'out-events', icon: '🎪', role: 'Outreach', name: 'Events This Season', type: 'number', value: 0, visibility: 'public' },
  { id: 'out-reached', icon: '🙌', role: 'Outreach', name: 'People Reached', type: 'number', value: 0, visibility: 'public' },
  { id: 'out-hours', icon: '⏱️', role: 'Outreach', name: 'Outreach Hours', type: 'number', unit: 'hrs', value: 0, visibility: 'public' },
  { id: 'out-orgs', icon: '🏢', role: 'Outreach', name: 'Organizations Worked With', type: 'number', value: 0, visibility: 'public' },
  // No event entry here — events get their own tab. See RETIRED_SEED_IDS.

  // Hardware (CAD / Assembly / Wiring) shares RobotDashboard — no seeds.

  // Programming runs on SoftwareDashboard — no seeds.

  // Scouting
  { id: 'sco-teams', icon: '🔍', role: 'Scouting', name: 'Teams Scouted', type: 'number', value: 0, visibility: 'public' },
  { id: 'sco-matches', icon: '📊', role: 'Scouting', name: 'Matches Logged', type: 'number', value: 0, visibility: 'public' },
]

export const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
