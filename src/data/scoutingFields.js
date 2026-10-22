// What we record about a team in a match.
//
// One definition drives the form, the table, the CSV export and the averages,
// so adding a field is an entry here and nothing else. That matters for
// scouting in particular: the game changes every season, and the parts that
// change are mostly these.
//
// type:
//   'number' — a count, kept as a number so it can be averaged
//   'choice' — pick one of options
//   'scale'  — a rating; min..max inclusive, shown as buttons
//   'yesno'  — Yes / No, stored as 1 / 0 so a team's matches average into a
//              share. Older rows held a count here; anything above 0 is a Yes.
//   'text'   — free text, never aggregated
// Everything is required. A half-filled row cannot be compared against a full
// one, so a scout who genuinely did not see something should say so in
// Comments rather than leave a silent gap in the averages.

import { startLabel, START_TILE_OPTIONS } from './fieldMap'

const YES_NO = ['Yes', 'No']

// Tick-all answers that cancel the rest: nothing happened, or no points were
// won. Ticking one of these clears the others, and ticking anything else
// clears this — otherwise a row can claim both Garden and Nothing, and
// whichever the averages believe is wrong.
export const EXCLUSIVE_OPTIONS = ['None', 'Nothing']

export const SCOUTING_FIELDS = [
  { key: 'team_number',   label: 'Team',  hint: 'Team number',  type: 'text', required: true, group: 'Match' },
  { key: 'match_number',  label: 'Match', hint: 'Match number', type: 'text', required: true, group: 'Match' },
  // Tapped on a picture of the field rather than picked off a list: a scout
  // looking at the field should not have to translate what they can see into
  // somebody else's word for it.
  // The options are the wall tiles a robot may legally start on (manual
  // G304), named by the field's tile grid; the scout taps the tile. Older
  // matches saved as a free "x,y" point or as Left/Middle/Right still read —
  // see data/fieldMap.js.
  { key: 'start_position',label: 'Starting Position', hint: 'Tap the wall tile the robot starts on', type: 'field', required: true, group: 'Match',
    options: START_TILE_OPTIONS },

  // Shot vs made, not "did they score": a team that attempts ten and lands two
  // is a different team from one that attempts two and lands two, and the old
  // yes/no could not tell them apart. auto_collected is gone — collecting with
  // nothing to show for it was never the question.
  { key: 'auto_shot',     label: 'Auto Shot',   hint: 'How many they attempted', type: 'number', required: true, group: 'Autonomous' },
  { key: 'auto_made',     label: 'Auto Made',   hint: 'How many went in',        type: 'number', required: true, group: 'Autonomous' },
  { key: 'auto_leave',    label: 'Leave',       hint: 'Did they leave the start?', type: 'yesno', required: true, group: 'Autonomous', options: YES_NO },
  { key: 'auto_park',     label: 'Park',        hint: 'Did they park?',          type: 'yesno', required: true, group: 'Autonomous', options: YES_NO },
  { key: 'auto_tips',     label: 'Hive Tips',   hint: 'Times they tipped the hive in auto', type: 'number', required: true, group: 'Autonomous' },
  { key: 'auto_reliability', label: 'Auto Reliability', hint: 'How much of it worked', type: 'percent', required: true, group: 'Autonomous' },
  { key: 'auto_notes',    label: 'Auto Notes',  hint: 'Anything about their auto', type: 'text', required: false, group: 'Autonomous' },

  { key: 'teleop_shot',   label: 'Teleop Shot', hint: 'How many they attempted', type: 'number', required: true, group: 'Teleop' },
  { key: 'teleop_made',   label: 'Teleop Made', hint: 'How many went in',        type: 'number', required: true, group: 'Teleop' },
  { key: 'teleop_tips',   label: 'Hive Tips',   hint: 'Times they tipped the hive in teleop', type: 'number', required: true, group: 'Teleop' },
  { key: 'cycle_count',   label: 'Cycle Count', hint: 'Completed scoring cycles', type: 'number', required: true, group: 'Teleop' },
  { key: 'avg_cycle_sec', label: 'Avg Cycle Time', hint: 'Rough seconds per cycle', type: 'number', required: true, group: 'Teleop' },
  { key: 'teleop_notes',  label: 'Teleop Notes', hint: 'Anything about their teleop', type: 'text', required: false, group: 'Teleop' },

  // More than one can be true in the same endgame, so this is tick-all rather
  // than pick-one.
  { key: 'endgame',       label: 'Endgame', hint: 'Everything they did', type: 'multi', required: true, group: 'Endgame',
    options: ['Garden', 'Parking', 'Flowers', 'Nothing'] },
  // map: asked by pointing at the flowers on the field rather than ticking
  // four words in a row. Still type 'multi' and still stored as a
  // comma-joined list, so the table, the CSV and everything already scouted
  // read exactly the same — only the input changes. Positions live in
  // data/fieldMap.js.
  // The endgame ticks say what a team went for. These two say how it went,
  // because "Garden" against a team that scored one and a team that scored
  // six is the same tick and a different robot. Parking is where they
  // finished, which is the part worth a pick.
  { key: 'endgame_shot',  label: 'Endgame Shot', hint: 'How many they attempted in the last 30 seconds', type: 'number', required: true, group: 'Endgame' },
  { key: 'endgame_made',  label: 'Endgame Made', hint: 'How many of those went in', type: 'number', required: true, group: 'Endgame' },
  { key: 'garden_score',  label: 'Garden Scoring', hint: 'How many they scored in the garden', type: 'number', required: true, group: 'Endgame' },
  { key: 'parking',       label: 'Parking', hint: 'Where they finished', type: 'choice', required: true, group: 'Endgame',
    options: ['None', 'Partial', 'Full'] },

  { key: 'flowers_owned', label: 'Flowers Owned', hint: 'Tap the ones they owned at the end', type: 'multi', map: true, required: false, group: 'Endgame',
    options: ['Left', 'Centre Left', 'Centre Right', 'Right'] },
  // None is on the list on purpose. Plenty of teams finish a match with no
  // ranking points at all, and without it the only way to record that is to
  // leave the question blank — which reads identically to a scout who never
  // got round to answering. Ticking None says it was nil, and that is a
  // different fact worth being able to tell apart.
  //
  // Named as the BIOBUZZ results screen names them (Competition Manual
  // Table 10-2): WIN 3 RP, TIE 1 RP, SWARM 1 RP (LEAVE + PARK points at or
  // above the threshold), POLLINATOR 1 and 2 at 1 RP each (HIVE TIPS at or
  // above each threshold). The icon sits on the chip so a scout can match
  // it to the screen by eye. Older rows saying Auto or Endgame still count,
  // as one point each.
  { key: 'rp_points',     label: 'RP Points', hint: 'Tick each one shown on the results screen, or None', type: 'multi', required: false, group: 'Endgame',
    options: ['Win', 'Tie', 'Swarm', 'Pollinator 1', 'Pollinator 2', 'None'],
    // Drawn by components/RpIcon.jsx on the form; these are the text stand-ins elsewhere.
    icons: { 'Win': '🏆🏆🏆', 'Tie': '🏆', 'Swarm': '🤖', 'Pollinator 1': '⌂1', 'Pollinator 2': '⌂2', 'None': '—' } },

  { key: 'defense',       label: 'Defense', hint: 'How much they played it', type: 'choice', required: true, group: 'Defense',
    options: ['None', 'Some', 'Strong'] },
  { key: 'defense_resistance', label: 'Defense Resistance', hint: 'How well they handle being defended', type: 'percent', required: true, group: 'Defense' },

  { key: 'robot_speed',   label: 'Robot Speed',  hint: '1–5', type: 'scale', required: true, min: 1, max: 5, group: 'Ratings' },
  { key: 'driver_skill',  label: 'Driver Skill', hint: '1–5', type: 'scale', required: true, min: 1, max: 5, group: 'Ratings' },
  { key: 'consistency',   label: 'Consistency',  hint: '1–5', type: 'scale', required: true, min: 1, max: 5, group: 'Ratings' },

  // Counted, not graded. "Major" told you the worst one and nothing about how
  // often, which is the half that decides whether to pick them.
  { key: 'minors',        label: 'Minor Penalties', hint: 'How many', type: 'number', required: true, group: 'Problems' },
  { key: 'majors',        label: 'Major Penalties', hint: 'How many', type: 'number', required: true, group: 'Problems' },
  { key: 'breakdowns',    label: 'Breakdowns', hint: 'Mechanical trouble', type: 'choice', required: true, group: 'Problems',
    options: ['None', 'Minor', 'Major'] },

  { key: 'comments',      label: 'Comments', hint: 'Anything unusual', type: 'text', required: true, group: 'Notes' },
]

// The order groups appear in, taken from the fields themselves so the two can
// never disagree.
export const SCOUTING_GROUPS = SCOUTING_FIELDS.reduce(
  (acc, f) => (acc.includes(f.group) ? acc : [...acc, f.group]), [])

export const FIELD_BY_KEY = Object.fromEntries(SCOUTING_FIELDS.map(f => [f.key, f]))

// Worth averaging across matches: counts, ratings and yes/no (as a share of
// matches). A choice is a label and free text is prose — neither means
// anything as a mean.
export const NUMERIC_FIELDS = SCOUTING_FIELDS.filter(f => f.type === 'number' || f.type === 'scale' || f.type === 'yesno' || f.type === 'percent')

// A stored yes/no as 1, 0 or null. Rows saved before these were yes/no hold
// a count, and any count above zero means they did it.
export const yesNo = (v) => (v == null || v === '' ? null : Number(v) > 0 ? 1 : 0)

// A stored value as a person should read it, in a table or a CSV.
export const displayValue = (f, v) => {
  if (v == null || v === '') return ''
  if (f?.type === 'yesno') return yesNo(v) ? 'Yes' : 'No'
  // A start is a point. On its own "34,81" tells a reader nothing, so it is
  // shown as the side of the field it is on with the point kept beside it.
  if (f?.type === 'field') {
    const label = startLabel(v)
    return label && label !== String(v) ? `${label} (${v})` : String(v)
  }
  return String(v)
}

export const blankEntry = () =>
  Object.fromEntries(SCOUTING_FIELDS.map(f => [f.key, '']))

// What each ticked ranking point is worth, for RadRank's RP per match.
export const RP_VALUE = { 'Win': 3, 'Tie': 1, 'Swarm': 1, 'Pollinator 1': 1, 'Pollinator 2': 1, 'Auto': 1, 'Endgame': 1 }
export const rpOf = (ticked) => String(ticked || '').split(',').map(t => t.trim())
  .reduce((sum, t) => sum + (RP_VALUE[t] || 0), 0)
