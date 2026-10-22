import { HOME_TEAM_NUMBER } from '../data/team'
// Keeping one team's rows away from another's.
//
// Boards and tasks carry owner_team; everything behind the feature tabs
// carries team_number. Same idea, one rule, written once — because a filter
// that each call site invents for itself is a filter one of them gets wrong,
// and getting it wrong here means showing a team somebody else's work.
//
// NULL means Radical. That makes every row written before sister teams
// existed ours, which is true, and means a forgotten filter fails towards our
// own data rather than towards someone else's.

// The PostgREST fragment for "rows belonging to this team".
//
//   teamScope('38350')  ->  'team_number=eq.38350'
//   teamScope(null)     ->  'team_number=is.null'
//
// Pass the viewer's team number. Radical members pass nothing.
export function teamScope(teamNumber, column = 'team_number') {
  const n = String(teamNumber || '').trim()
  return n && n !== HOME ? `${column}=eq.${encodeURIComponent(n)}` : `${column}=is.null`
}

const HOME = HOME_TEAM_NUMBER

// The same rule, for code that runs outside a component and so cannot read
// myTeamNumber from usePermissions — module-level helpers, mostly.
//
// UserContext writes the signed-in team number here on every sign-in and
// localStorage.clear() on sign-out removes it, so it tracks the session. An
// absent value reads as Radical, which is the same safe direction teamScope
// takes: a missing answer shows us our own data, never somebody else's.
export function storedTeamScope(column = 'team_number') {
  let n = ''
  try { n = window.localStorage.getItem('scrum-team-number') || '' } catch { n = '' }
  return teamScope(n, column)
}

// Stamp a row with its owner on the way in, so the filter above has something
// to match next time. Radical rows are left unstamped, matching NULL.
// `column` is 'team_number' except where a table keeps its owner elsewhere:
// boards, tasks and the scouting tables use owner_team, because in
// match_scouting and considered_teams team_number is the robot being scouted.
export function stampTeam(row, teamNumber, column = 'team_number') {
  const n = String(teamNumber || '').trim()
  return n && n !== HOME ? { ...row, [column]: n } : row
}

// The same two rules again, for the supabase-js query builder rather than a
// URL. Some code reaches the database through the client instead of fetch, and
// a filter it cannot express is a filter it will not have.
//
// Both read the stored team number, so they work outside a component.
export function scopeQuery(query, column = 'team_number') {
  let n = ''
  try { n = window.localStorage.getItem('scrum-team-number') || '' } catch { n = '' }
  n = String(n || '').trim()
  return (n && n !== HOME) ? query.eq(column, n) : query.is(column, null)
}

// Stamp on the way in, for the same callers.
export function stampStored(row, column = 'team_number') {
  let n = ''
  try { n = window.localStorage.getItem('scrum-team-number') || '' } catch { n = '' }
  return stampTeam(row, n, column)
}

// Live updates arrive for every team, not just ours.
//
// A realtime subscription with no filter is broadcast to everyone listening,
// and realtime filters cannot express "is null" — which is how our own rows
// are stored. So handlers that drop payload rows straight into state were
// showing one team another team's work the moment it was created: start
// attendance on Radical and a session appeared on Prime Suspects.
//
// Wrap the handler in this. DELETE is let through untouched: it carries only
// an id, and removing an id we never had changes nothing.
export function onlyMyTeam(handler, column = 'team_number') {
  return (payload) => {
    if (payload?.eventType !== 'DELETE' && !rowIsMine(payload?.new, column)) return
    return handler(payload)
  }
}

// rowBelongs against the team this session is signed in as.
export function rowIsMine(row, column = 'team_number') {
  let n = ''
  try { n = window.localStorage.getItem('scrum-team-number') || '' } catch { n = '' }
  return rowBelongs(row, n, column)
}

// Is this row ours to show? For filtering in memory where a query cannot be
// changed — a last line, never the only one.
export function rowBelongs(row, teamNumber, column = 'team_number') {
  const mine = String(teamNumber || '').trim()
  const theirs = String(row?.[column] || '').trim()
  // '7196' on a row is Radical too, the same as NULL.
  const theirsKey = theirs === HOME ? '' : theirs
  return (!mine || mine === HOME) ? !theirsKey : theirsKey === mine
}
