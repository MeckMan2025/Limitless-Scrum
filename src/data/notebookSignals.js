// What happened today — the evidence signals a notebook entry can carry.
//
// This file is the single source of truth for BOTH the entry form and the Team
// Growth dashboard. Adding a signal here adds its card, its follow-up
// questions, its summary tile and its chart series, with no other file
// touched. That is the point: the notebook has to keep growing without being
// rewritten each time.
//
// A question is { id, type, label, options?, showIf? }:
//   type 'text'    — one short line
//   type 'choice'  — pick one of options
//   showIf(answers) — only asked when the earlier answer calls for it
//
// Answers are stored under the signal's key, so entry.signal_data.tested.what
// is "what did you test". Nothing here is required; an entry with no signals
// at all is a perfectly good entry.

export const SIGNALS = [
  {
    key: 'learned',
    label: 'I learned something new',
    helper: 'You gained a new skill, concept, or understanding.',
    emoji: '💡',
    // Card title on the dashboard. Positive, and about the team rather than
    // about ranking anyone.
    metric: 'Learning Moments',
    color: '#4d7fd6',
    soft: '#dbeafe',
    questions: [
      { id: 'what', type: 'text', label: 'What did you learn?' },
      {
        id: 'confidence', type: 'choice', label: 'How confident are you now?',
        options: [
          'Just introduced to it',
          'I understand the basics',
          'I can do it with some help',
          'I can do it independently',
          'I could teach someone else',
        ],
      },
    ],
  },

  {
    key: 'help',
    label: 'I got help',
    helper: 'Someone helped you understand, solve, or continue your work.',
    emoji: '🤝',
    metric: 'Help Received',
    color: '#d97b9a',
    soft: '#fce7f3',
    questions: [
      {
        id: 'who', type: 'choice', label: 'Who helped you?',
        options: ['Teammate', 'Team lead', 'Mentor', 'Coach', 'STEM professional / outside expert', 'Other'],
      },
      { id: 'what', type: 'text', label: 'What did they help you with?' },
      {
        id: 'result', type: 'choice', label: 'What changed because of their help?',
        options: [
          'I understood something better',
          'I was able to continue my task',
          'We changed our design or approach',
          'We solved a problem',
          'I learned a new skill',
          'Other',
        ],
      },
    ],
  },

  {
    key: 'helped',
    label: 'I helped someone else',
    helper: 'You taught, explained, demonstrated, or helped someone get unstuck.',
    emoji: '🧑‍🏫',
    metric: 'Times We Helped Each Other',
    color: '#e08a4a',
    soft: '#ffedd5',
    questions: [
      {
        id: 'who', type: 'choice', label: 'Who did you help?',
        options: ['Teammate', 'Rookie/new member', 'Team lead', 'Another FRC team', 'Other'],
      },
      { id: 'what', type: 'text', label: 'What did you help them with?' },
      {
        id: 'how', type: 'choice', label: 'How did you help?',
        options: [
          'Explained something',
          'Demonstrated a skill',
          'Worked through a problem with them',
          'Reviewed their work',
          'Helped them get unstuck',
          'Other',
        ],
      },
      {
        id: 'independent', type: 'choice', label: 'Could they do it more independently afterward?',
        options: ['Yes', 'Somewhat', 'Not yet'],
      },
    ],
  },

  {
    key: 'tested',
    label: 'I tested something',
    helper: 'You ran a trial, measured performance, compared options, or checked whether something worked.',
    emoji: '🧪',
    metric: 'Tests Documented',
    color: '#7c5cc4',
    soft: '#f3e8ff',
    questions: [
      { id: 'what', type: 'text', label: 'What did you test?' },
      {
        id: 'how', type: 'choice', label: 'How did you test it?',
        options: [
          'Repeated trials',
          'Compared multiple options',
          'Measured performance',
          'Driver practice',
          'Software test',
          'Other',
        ],
      },
      {
        id: 'outcome', type: 'choice', label: 'What happened?',
        options: [
          'It worked as expected',
          'It partly worked',
          'It failed',
          'Results were inconsistent',
          'We need more testing',
        ],
      },
      {
        id: 'changed', type: 'choice', label: 'Did the test change what you decided to do next?',
        options: ['Yes', 'No', 'Not yet'],
      },
      {
        id: 'changedWhat', type: 'text', label: 'What changed because of the test?',
        showIf: (a) => a.changed === 'Yes',
      },
    ],
  },

  {
    key: 'improved',
    label: 'I improved or changed something',
    helper: 'You changed your approach, design, code, or process based on what you learned.',
    emoji: '🔧',
    metric: 'Improvements Made',
    color: '#2f9e6e',
    soft: '#dcfce7',
    questions: [
      { id: 'what', type: 'text', label: 'What did you change?' },
      {
        id: 'why', type: 'choice', label: 'Why did you change it?',
        options: [
          'Test results',
          'Something failed',
          'Mentor/teammate feedback',
          'Driver feedback',
          'Better idea discovered',
          'Needed to simplify it',
          'Other',
        ],
      },
      {
        id: 'better', type: 'choice', label: 'Did the change improve the result?',
        options: ['Yes', 'Somewhat', 'Not yet', 'It made it worse, so we changed again'],
      },
      {
        id: 'next', type: 'text', label: 'What will you try next?',
        // Asked whenever it isn't a clean yes — that is where the next
        // iteration actually lives.
        showIf: (a) => !!a.better && a.better !== 'Yes',
      },
    ],
  },

  {
    key: 'initiative',
    label: 'I took initiative',
    helper: 'You noticed useful work that needed to happen and acted without waiting to be assigned.',
    emoji: '🚀',
    metric: 'Initiative Moments',
    color: '#c9a227',
    soft: '#fef9c3',
    questions: [
      { id: 'noticed', type: 'text', label: 'What did you notice needed to be done?' },
      {
        id: 'did', type: 'choice', label: 'What did you do without being directly assigned?',
        options: [
          'Started useful work',
          'Solved a problem',
          'Helped someone who needed it',
          'Improved something',
          'Organized something',
          'Researched something',
          'Other',
        ],
      },
      {
        id: 'result', type: 'choice', label: 'What was the result?',
        options: [
          'It helped the team move forward',
          'It prevented a problem',
          'It improved something',
          'It helped another person',
          'It created a new idea/opportunity',
          'Not sure yet',
        ],
      },
    ],
  },

  {
    key: 'failed',
    label: 'Something failed and I learned from it',
    helper: 'Something didn’t work as expected, and you learned why or what to try next.',
    emoji: '🧩',
    // Named for what it produces, not for the setback — a count of failures is
    // not something anyone wants their name against, and the useful part is
    // what came out of it.
    metric: 'Lessons Learned',
    color: '#8a94a6',
    soft: '#f3f4f6',
    questions: [
      { id: 'what', type: 'text', label: 'What failed or didn’t work?' },
      {
        id: 'cause', type: 'choice', label: 'What do you think caused it?',
        options: [
          'Design issue',
          'Programming issue',
          'Build/assembly issue',
          'Incorrect assumption',
          'Human error',
          'Not sure yet',
          'Other',
        ],
      },
      { id: 'learned', type: 'text', label: 'What did you learn from it?' },
      {
        id: 'next', type: 'choice', label: 'What will you do next?',
        options: [
          'Try a different design',
          'Change the code',
          'Retest',
          'Ask for help',
          'Research more',
          'Keep investigating',
          'Other',
        ],
      },
    ],
  },

  {
    key: 'collaborated',
    label: 'I collaborated with someone',
    helper: 'You worked with someone else to solve a problem, make a decision, or complete something together.',
    emoji: '👥',
    metric: 'Collaborations',
    color: '#3aa6b9',
    soft: '#cffafe',
    questions: [
      {
        id: 'who', type: 'choice', label: 'Who did you collaborate with?',
        options: [
          'Someone in my group',
          'Someone from another department',
          'Team lead',
          'Mentor/coach',
          'Another FRC team',
          'Other',
        ],
      },
      { id: 'what', type: 'text', label: 'What were you working on together?' },
      {
        id: 'why', type: 'choice', label: 'Why was working together useful?',
        options: [
          'We combined different skills',
          'We made a better decision',
          'We solved a problem faster',
          'I learned something from them',
          'They learned something from me',
          'We connected work between different parts of the team',
          'Other',
        ],
      },
      { id: 'outcome', type: 'text', label: 'What came out of the collaboration?' },
    ],
  },
]

export const SIGNAL_BY_KEY = Object.fromEntries(SIGNALS.map(s => [s.key, s]))

// Which questions a signal is actually asking, given what's been answered so
// far. Used by the form to decide what to show and by the dashboard to know
// which answers are meaningful.
export function visibleQuestions(signal, answers = {}) {
  return (signal?.questions || []).filter(q => !q.showIf || q.showIf(answers))
}

// Entries written before this existed have no signals, and that is not a gap in
// the data — it is simply an older entry. Everything reading signals goes
// through here so a missing column never becomes a crash.
export function signalsOf(entry) {
  const raw = entry?.signals
  if (Array.isArray(raw)) return raw.filter(k => SIGNAL_BY_KEY[k])
  return []
}

export function answersFor(entry, key) {
  return entry?.signal_data?.[key] || {}
}

export function hasSignal(entry, key) {
  return signalsOf(entry).includes(key)
}
