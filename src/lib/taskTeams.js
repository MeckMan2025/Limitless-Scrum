// Assigning a task to a whole side of the team.
//
// Derived from the org chart's departments rather than listed again here, so
// Business / Hardware / Software mean the same thing on a task as they do on
// the chart, and a role moving between departments moves with it.

import { DEPARTMENTS } from '../data/orgRoles'

export const UP_FOR_GRABS = '__up_for_grabs__'
export const EVERYONE = '__everyone__'

const EMOJI = { business: '💼', hardware: '🔧', software: '💻' }

// The board each side of the team works out of. The board ids are older than
// the department keys and were named differently, so the two are mapped here
// instead of renamed — the boards are permanent and already carry every task.
const BOARD_OF = { business: 'business', hardware: 'technical', software: 'programming' }

export const TEAM_ASSIGNEES = DEPARTMENTS.map(d => ({
  value: `__team_${d.key}__`,
  key: d.key,
  label: `${d.label} team`,
  emoji: EMOJI[d.key] || '👥',
  board: BOARD_OF[d.key] || null,
  // Anyone holding one of these tags is on that side.
  tags: [d.leadTag, d.coLeadTag, ...d.roles.map(r => r.tag)].filter(Boolean),
}))

// The sides that have a board of their own — the ones a task can be split
// across. A task can name several, and then it is one row on several boards.
export const SIDES = TEAM_ASSIGNEES.filter(t => t.board)

const byBoard = Object.fromEntries(SIDES.map(t => [t.board, t]))

// Sides <-> boards, both keyed by the department key ('business', 'hardware',
// 'software') — the same values a task stores in its sides column.
export const boardsForSides = (keys) =>
  SIDES.filter(t => (keys || []).includes(t.key)).map(t => t.board)
export const sidesForBoards = (boardIds) =>
  (boardIds || []).map(b => byBoard[b]?.key).filter(Boolean)
export const sideForBoard = (boardId) => byBoard[boardId] || null

const byValue = Object.fromEntries(TEAM_ASSIGNEES.map(t => [t.value, t]))

export const isTeamAssignee = (v) => !!byValue[v]
export const teamOf = (v) => byValue[v] || null
export const teamLabel = (v) => {
  const t = byValue[v]
  return t ? `${t.emoji} ${t.label}` : null
}

// Which team assignees a person's tasks should include, from their role tags.
export const teamsForTags = (tags) =>
  TEAM_ASSIGNEES.filter(t => (tags || []).some(tag => t.tags.includes(tag))).map(t => t.value)

// Every assignee value that counts as "mine", for the task queries.
export const myAssigneeValues = (username, tags) =>
  [username, EVERYONE, ...teamsForTags(tags)].filter(Boolean)

// The department keys of the sides a person is on, matching what a task stores.
export const sidesForTags = (tags) =>
  SIDES.filter(t => (tags || []).some(tag => t.tags.includes(tag))).map(t => t.key)

// The `or=(…)` fragment behind every "my tasks" query: assigned to me by name,
// to everyone, to a side I'm on the old single-assignee way, or listed in the
// sides a task was given to. Being on a board is deliberately NOT enough —
// a task simply filed on the Business board is not everyone in Business's job.
export const myTasksFilter = (name, tags, includeNew = true) => {
  const groups = [EVERYONE, ...teamsForTags(tags)].join(',')
  const mine = sidesForTags(tags)
  const parts = [
    `assignee.ilike.${encodeURIComponent(name)}`,
    `assignee.in.(${groups})`,
  ]
  if (includeNew) {
    // On the task alongside other people, or given to a side I'm on.
    parts.push(`assignees.cs.{"${name}"}`)
    if (mine.length) parts.push(`sides.ov.{${mine.join(',')}}`)
  }
  return parts.join(',')
}

// Asking for the sides or assignees columns before supabase/tasks_sides.sql has
// been run makes PostgREST reject the whole query, which would empty everyone's
// task list. So drop those clauses and ask again rather than show nothing.
export const fetchMyTasks = (supabaseUrl, headers, name, tags, extra = '&select=*') => {
  const ask = (includeNew) => fetch(
    `${supabaseUrl}/rest/v1/tasks?or=(${myTasksFilter(name, tags, includeNew)})${extra}`,
    { headers },
  )
  return ask(true).then(res => res.status === 400 ? ask(false) : res)
}

// One label for any assignee value, so every screen says the same thing.
export const assigneeLabel = (v) => {
  if (v === UP_FOR_GRABS) return '🙋 Up for Grabs'
  if (v === EVERYONE) return '👥 Everyone'
  return teamLabel(v) || v || 'Unassigned'
}
