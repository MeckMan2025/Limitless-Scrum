// How scouting is actually organised at a competition.
//
// Three groups, each covering all four alliance positions, each led by a head
// scouter. Groups rotate across matches so nobody is on for an hour straight,
// and each rotation is tied to a field — at a two-field event you cannot watch
// both, so the group follows the field.
//
// Sample data, matching the layout the team already keeps in a spreadsheet.
// Replace GROUPS and ROTATION with the real fetch when there is one; every
// component below reads these shapes and nothing else.

// Who is in the pit, and who is scouting matches. Two standing groups for the
// day rather than a per-match rotation: the pit is wherever the robot is, and
// match scouting is everyone who takes a seat in the stands.
//
// Sample data like the rest of this file. Replace with the real fetch when
// there is one; the components read names and nothing else.
export const PIT_GROUP = ['Braden', 'Maanya', 'Varun', 'Kundan']

export const MATCH_SCOUTING_GROUP = ['Kayden', 'Ashrit', 'Jacob', 'Charan', 'Kashvi', 'Ricky']

export const POSITIONS = ['Red 1', 'Red 2', 'Blue 1', 'Blue 2']

export const GROUPS = [
  {
    id: 1,
    head: 'Braden',
    members: { 'Red 1': 'Kayden', 'Red 2': 'Ashrit', 'Blue 1': 'Jacob', 'Blue 2': 'Charan' },
  },
  {
    id: 2,
    head: 'Rian',
    members: { 'Red 1': 'Kashvi', 'Red 2': 'Ricky', 'Blue 1': 'Alexiandria', 'Blue 2': 'Reyansh' },
  },
  {
    id: 3,
    head: 'Arav',
    members: { 'Red 1': 'Anish', 'Red 2': 'Keegan', 'Blue 1': 'Weston', 'Blue 2': 'Daegus' },
  },
]

export const STANDBY = ['Yukti', 'Chethan', 'Isabella']

// Which group has which matches, and on which field. The odd/even split is
// what a two-field event looks like: one group takes the odds, another the
// evens, and they swap after the first rotation so nobody gets every early
// match two events running.
export const ROTATION = [
  { group: 1, field: 'Field A', colour: '#3b82f6', matches: [1, 3, 5, 7, 9] },
  { group: 2, field: 'Field B', colour: '#ef4444', matches: [2, 4, 6, 8, 10] },
  { group: 3, field: 'Field C', colour: '#22c55e', matches: [11, 13, 15, 17, 19] },
  { group: 1, field: 'Field A', colour: '#3b82f6', matches: [12, 14, 16, 18, 20] },
  { group: 2, field: 'Field B', colour: '#ef4444', matches: [21, 23, 25, 27, 29] },
]

// Where one person sits in all of this: their group, their position, and the
// matches that follow from it. Matched on first name, which is what the
// spreadsheet holds — a full display name still finds them.
export function findMe(name) {
  const first = String(name || '').trim().split(/\s+/)[0].toLowerCase()
  if (!first) return null

  for (const g of GROUPS) {
    if (g.head.toLowerCase() === first) {
      return { group: g.id, position: 'Head scouter', head: g.head }
    }
    for (const pos of POSITIONS) {
      if ((g.members[pos] || '').toLowerCase() === first) {
        return { group: g.id, position: pos, head: g.head }
      }
    }
  }
  if (STANDBY.some(s => s.toLowerCase() === first)) {
    return { group: null, position: 'Stand by', head: null }
  }
  return null
}

export const matchesForGroup = (groupId) =>
  ROTATION.filter(r => r.group === groupId)

// What each group is down to cover: a team, and for match scouting the match
// it is being watched in. The pit has no match number — you visit a team's pit
// once — so those rows carry null and the column reads "—".
//
// Sample data like the rest of this file. Replace with the real fetch when
// there is one; the chart reads {team, match} and nothing else.
export const PIT_ASSIGNMENTS = [
  { team: '367', match: null, who: 'Braden' },
  { team: '4177', match: null, who: 'Maanya' },
  { team: '4237', match: null, who: 'Varun' },
  { team: '5062', match: null, who: 'Kundan' },
  { team: '6072', match: null, who: 'Braden' },
  { team: '6093', match: null, who: 'Maanya' },
  { team: '6458', match: null, who: 'Varun' },
  { team: '6545', match: null, who: 'Kundan' },
  { team: '6603', match: null, who: 'Braden' },
  { team: '8588', match: null, who: 'Maanya' },
]

export const MATCH_ASSIGNMENTS = [
  { team: '13532', match: '1', who: 'Kayden' },
  { team: '8588', match: '1', who: 'Ashrit' },
  { team: '22064', match: '1', who: 'Jacob' },
  { team: '5062', match: '1', who: 'Charan' },
  { team: '6072', match: '2', who: 'Kashvi' },
  { team: '6458', match: '2', who: 'Ricky' },
  { team: '18482', match: '2', who: 'Kayden' },
  { team: '5062', match: '2', who: 'Ashrit' },
  { team: '32494', match: '3', who: 'Jacob' },
  { team: '8813', match: '3', who: 'Charan' },
  { team: '4237', match: '3', who: 'Kashvi' },
  { team: '6093', match: '3', who: 'Ricky' },
  { team: '23971', match: '4', who: 'Kayden' },
  { team: '22479', match: '4', who: 'Ashrit' },
  { team: '6072', match: '4', who: 'Jacob' },
  { team: '10082', match: '4', who: 'Charan' },
  { team: '6093', match: '5', who: 'Kashvi' },
  { team: '23971', match: '5', who: 'Ricky' },
  { team: '5062', match: '5', who: 'Kayden' },
  { team: '6545', match: '5', who: 'Ashrit' },
  { team: '8988', match: '6', who: 'Jacob' },
  { team: '5062', match: '6', who: 'Charan' },
  { team: '22064', match: '6', who: 'Kashvi' },
  { team: '4237', match: '6', who: 'Ricky' },
]

// The match being played right now. A row for this match counts as being
// scouted at this moment rather than missed — the scout is sitting there with
// the sheet. There is nowhere in the data that says which match is live yet,
// so this is a sample value; point it at the real one when there is one.
export const CURRENT_MATCH = '3'
