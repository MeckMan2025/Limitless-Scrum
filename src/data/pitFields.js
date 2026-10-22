// What we record about a team in their pit.
//
// Same shape as scoutingFields.js, and for the same reason: one definition
// drives the form, the table, the CSV and anything that counts. A pit sheet is
// a conversation rather than a stopwatch, so almost everything here is a choice
// or a sentence — there is nothing to average, and pretending otherwise would
// put numbers on opinions.
//
// type:
//   'choice' — pick one of options
//   'text'   — a short answer, never aggregated
//   'photo'  — a picture taken or picked on the phone, uploaded, stored as its URL
//
// Unlike match scouting, not everything is required. You get one pass at a pit
// and the team might be mid-repair with half the robot on the bench; a sheet
// that refuses to save without an answer about endgame just means the scout
// invents one. The things we will not guess at — who the team is, who asked —
// are required; judgements are not.

const UNKNOWN = 'Unknown'

export const PIT_FIELDS = [
  { key: 'team_number',  label: 'Team Number', hint: 'The team you are visiting', type: 'text', required: true,  group: 'Team Info' },
  { key: 'team_name',    label: 'Team Name',   hint: '',                          type: 'text', required: false, group: 'Team Info' },
  { key: 'scout_name',   label: 'Scout Name',  hint: 'Who filled this in',        type: 'text', required: true,  group: 'Team Info' },
  { key: 'visited_at',   label: 'Time / Date', hint: 'When you visited',          type: 'datetime', required: false, group: 'Team Info' },

  { key: 'drive_train',  label: 'Drive Train', hint: '', type: 'choice', required: false, group: 'Robot Basics',
    options: ['Mecanum', 'Tank', 'Swerve', 'Other'] },
  { key: 'main_scoring', label: 'Main Scoring Mechanism', hint: '', type: 'choice', required: false, group: 'Robot Basics',
    options: ['Shooter', 'Arm', 'Elevator/Lift', 'Intake + conveyor', 'Gripper/Claw', 'Other'],
    describe: {
      'Shooter': 'launches the game piece',
      'Arm': 'moves the piece into the scoring area',
      'Elevator/Lift': 'raises the piece vertically',
      'Intake + conveyor': 'collects and feeds pieces into a scorer',
      'Gripper/Claw': 'grabs and places pieces',
      'Other': 'something else — say what',
    } },
  { key: 'auto_scores',  label: 'Can they score in autonomous?', hint: '', type: 'choice', required: false, group: 'Robot Basics',
    options: ['Yes', 'No', 'Sometimes'] },
  { key: 'teleop_scores', label: 'Can they score during teleop?', hint: '', type: 'choice', required: false, group: 'Robot Basics',
    options: ['Yes', 'No'] },
  { key: 'endgame_tasks', label: 'Can they complete endgame tasks?', hint: '', type: 'choice', required: false, group: 'Robot Basics',
    options: ['Yes', 'No', 'Sometimes'] },

  { key: 'strengths',    label: 'What does this robot do really well?', hint: '', type: 'text', required: false, group: 'Strengths' },

  { key: 'weaknesses',   label: 'What seems unreliable or difficult for them?', hint: '', type: 'text', required: false, group: 'Weaknesses / Risks' },

  { key: 'auto_what',    label: 'What does their auto do?', hint: '', type: 'text', required: false, group: 'Autonomous' },
  { key: 'auto_consistency', label: 'How consistent is it?', hint: '', type: 'choice', required: false, group: 'Autonomous',
    options: ['Very consistent', 'Usually works', 'Sometimes works', 'Rarely works', UNKNOWN] },

  { key: 'preferred_role', label: 'Preferred role', hint: '', type: 'choice', required: false, group: 'TeleOp / Strategy',
    options: ['Main scorer', 'Support', 'Defense', 'Flexible'] },
  { key: 'cycle_speed',  label: 'Cycle speed', hint: '', type: 'choice', required: false, group: 'TeleOp / Strategy',
    options: ['Fast', 'Medium', 'Slow', UNKNOWN] },
  { key: 'works_around_robots', label: 'Can they work well around other robots?', hint: '', type: 'choice', required: false, group: 'TeleOp / Strategy',
    options: ['Yes', 'Somewhat', 'No', UNKNOWN] },

  { key: 'reliability',  label: 'Robot reliability', hint: '', type: 'choice', required: false, group: 'Reliability',
    options: ['Very reliable', 'Mostly reliable', 'Some issues', 'Frequent issues', UNKNOWN] },
  { key: 'known_problems', label: 'Any known robot problems today?', hint: '', type: 'text', required: false, group: 'Reliability' },

  { key: 'drive_confidence', label: 'Drive team confidence', hint: '', type: 'choice', required: false, group: 'Drive Team / Communication',
    options: ['High', 'Medium', 'Low', UNKNOWN] },
  { key: 'communicated_strategy', label: 'Did they communicate strategy clearly?', hint: '', type: 'choice', required: false, group: 'Drive Team / Communication',
    options: ['Yes', 'Somewhat', 'No'] },

  { key: 'alliance_pick', label: 'Would we want them as an alliance partner?', hint: '', type: 'choice', required: false, group: 'Alliance Notes',
    options: ['Definitely', 'Probably', 'Maybe', 'Probably not', 'Need more match data'] },
  { key: 'alliance_why', label: 'Why?', hint: '', type: 'text', required: false, group: 'Alliance Notes' },

  { key: 'final_notes',  label: 'Anything else we should know?', hint: '', type: 'text', required: false, group: 'Final Notes' },
  { key: 'photo_url',    label: 'Photo of robot', hint: 'Take one in the pit', type: 'photo', required: true, group: 'Final Notes' },
  { key: 'scout_confidence', label: 'Scout confidence in this report', hint: '', type: 'choice', required: false, group: 'Final Notes',
    options: ['High', 'Medium', 'Low'] },
]

export const PIT_GROUPS = PIT_FIELDS.reduce(
  (acc, f) => (acc.includes(f.group) ? acc : [...acc, f.group]), [],
)

export const PIT_FIELD_BY_KEY = Object.fromEntries(PIT_FIELDS.map(f => [f.key, f]))

// Nothing here is a number. Kept so the shape matches match scouting and
// anything reading both can ask the same question without a special case.
export const PIT_NUMERIC_FIELDS = []

export const blankPitEntry = () =>
  Object.fromEntries(PIT_FIELDS.map(f => [f.key, '']))

// "Other" on a choice question is stored in the same column as
// "Other: <what they said>", so nothing new is needed in the database and
// the answer still reads as one thing. Picking Other without saying what is
// not an answer, and the form will not save it.
export const OTHER = 'Other'
export const isOther = (v) => String(v || '').split(':')[0].trim() === OTHER
export const otherDetail = (v) => (isOther(v) ? String(v || '').replace(/^Other:?\s*/, '') : '')
export const choiceOf = (v) => (isOther(v) ? OTHER : String(v || ''))
