import { SIGNALS, SIGNAL_BY_KEY, visibleQuestions } from './notebookSignals.js'
import { WHY_OPTIONS } from './notebookOptions.js'

// Every question a voice entry has to answer, in the order the typed form asks
// them. EN Helper asks whichever of these are still empty after the student's
// first recording, one at a time, and an entry is only complete (and only
// wins the meeting's attendance back) once all of them are answered.
//
// A question is:
//   id        stable key
//   kind      'text' (said, or typed) | 'choice' (one) | 'multi' (several)
//             | 'photo' (a photo or a link)
//   label     what's shown and read out
//   hint      a smaller line under it, optional
//   options   for choice and multi: [{ value, label }]
//   answered  (entry) => bool
//   patch     (entry, value) => the columns to write
//
// `entry` is the notebook_entries row. voice_state.confirmed lists the
// questions the student answered themselves where the column alone can't tell
// (mentor yes/no, the project, the signals).

export const ENGAGEMENT_CHOICES = [
  { value: 'Very', label: '😄 Very' },
  { value: 'Somewhat', label: '🙂 Somewhat' },
  { value: 'Not', label: '😕 Not really' },
]

export const engagementNoteLabel = (level) =>
  `Why did you feel ${String(level || '').toLowerCase()} engaged?`

const ENGAGEMENT_NOTE_HINT = {
  Very: 'What made it a good one?',
  Somewhat: 'What would have made it better?',
  Not: 'What got in the way?',
}

const filled = (v) => typeof v === 'string' ? v.trim().length > 0 : v != null
const confirmed = (entry, id) => (entry?.voice_state?.confirmed || []).includes(id)
const confirm = (entry, id) => ({
  voice_state: {
    ...(entry?.voice_state || {}),
    confirmed: [...new Set([...(entry?.voice_state?.confirmed || []), id])],
  },
})

const answersOf = (entry, key) => entry?.signal_data?.[key] || {}

// All questions that apply to this entry right now. Some only appear once an
// earlier one is answered (mentor details, a signal's follow-ups), so this is
// re-read after every answer.
export function entryQuestions(entry, { projects = [], mentors = [] } = {}) {
  const qs = []

  qs.push({
    id: 'what_did', kind: 'text', label: 'What did you do?', hint: 'One or two sentences is plenty.',
    answered: e => filled(e.what_did),
    patch: (e, v) => ({ what_did: v }),
  })

  qs.push({
    id: 'why_option', kind: 'choice', label: 'Why did it matter?',
    options: WHY_OPTIONS.map(o => ({ value: o, label: o })),
    answered: e => WHY_OPTIONS.includes(e.why_option),
    patch: (e, v) => ({ why_option: v, ...(v === 'Other' ? {} : { why_note: '' }) }),
  })
  if (entry.why_option === 'Other') {
    qs.push({
      id: 'why_note', kind: 'text', label: 'Why did it matter? Say it in your own words.',
      answered: e => filled(e.why_note),
      patch: (e, v) => ({ why_note: v }),
    })
  }

  qs.push({
    id: 'engagement', kind: 'choice', label: 'How engaged were you?',
    options: ENGAGEMENT_CHOICES,
    answered: e => confirmed(e, 'engagement') && ['Very', 'Somewhat', 'Not'].includes(e.engagement),
    patch: (e, v) => ({ engagement: v, ...confirm(e, 'engagement') }),
  })
  if (confirmed(entry, 'engagement')) {
    qs.push({
      id: 'engagement_note', kind: 'text', label: engagementNoteLabel(entry.engagement),
      hint: ENGAGEMENT_NOTE_HINT[entry.engagement],
      answered: e => filled(e.engagement_note),
      patch: (e, v) => ({ engagement_note: v }),
    })
  }

  // Only asked when the team has projects to file under. Without any, the
  // category the AI read from the recording stands, as it would by default
  // in the typed form.
  if (projects.length) {
    qs.push({
      id: 'project', kind: 'choice', label: 'Which project was this for?',
      hint: "Pick the area if it wasn't one project.",
      options: [
        ...['Technical', 'Business', 'Programming'].map(c => ({ value: `cat:${c}`, label: c })),
        ...projects.map(p => ({ value: `proj:${p.id}`, label: p.name })),
      ],
      answered: e => confirmed(e, 'project'),
      patch: (e, v) => {
        const [kind, id] = v.split(/:(.*)/s)
        const project = projects.find(p => p.id === id)
        return kind === 'proj'
          ? { project_id: id, category: project?.category || 'Technical', ...confirm(e, 'project') }
          : { project_id: '', category: id, ...confirm(e, 'project') }
      },
    })
  }

  qs.push({
    id: 'mentor', kind: 'choice', label: 'Did a mentor help?',
    hint: 'Judges care whether the work was student-led.',
    options: [{ value: 'no', label: 'I did this on my own' }, { value: 'yes', label: 'A mentor helped' }],
    answered: e => confirmed(e, 'mentor'),
    patch: (e, v) => ({
      mentor_help: v === 'yes',
      ...(v === 'yes' ? {} : { mentor_name: '', mentor_note: '' }),
      ...confirm(e, 'mentor'),
    }),
  })
  if (confirmed(entry, 'mentor') && entry.mentor_help) {
    qs.push({
      id: 'mentor_name', kind: 'choice', label: 'Which mentor helped?',
      options: [...mentors, 'Someone else'].map(m => ({ value: m, label: m })),
      answered: e => filled(e.mentor_name),
      patch: (e, v) => ({ mentor_name: v }),
    })
    qs.push({
      id: 'mentor_note', kind: 'text', label: 'How did they help?',
      hint: 'For example: showed me how to set gear ratios, and I did the CAD.',
      answered: e => filled(e.mentor_note),
      patch: (e, v) => ({ mentor_note: v }),
    })
  }

  qs.push({
    id: 'signals', kind: 'multi', label: 'What happened today?', hint: 'Pick everything that did.',
    options: SIGNALS.map(s => ({ value: s.key, label: `${s.emoji} ${s.label}` })),
    answered: e => confirmed(e, 'signals') && (e.signals || []).length > 0,
    patch: (e, v) => {
      // Answers for signals that were unticked go too, so nothing orphaned
      // is counted by the dashboard.
      const keep = Object.fromEntries(Object.entries(e.signal_data || {}).filter(([k]) => v.includes(k)))
      return { signals: v, signal_data: keep, ...confirm(e, 'signals') }
    },
  })
  if (confirmed(entry, 'signals')) {
    for (const key of entry.signals || []) {
      const sig = SIGNAL_BY_KEY[key]
      if (!sig) continue
      for (const q of visibleQuestions(sig, answersOf(entry, key))) {
        qs.push({
          id: `signal:${key}:${q.id}`,
          kind: q.type === 'choice' ? 'choice' : 'text',
          label: q.label,
          hint: `${sig.emoji} ${sig.label}`,
          options: q.options?.map(o => ({ value: o, label: o })),
          answered: e => filled(answersOf(e, key)[q.id]),
          patch: (e, v) => ({
            signal_data: { ...(e.signal_data || {}), [key]: { ...answersOf(e, key), [q.id]: v } },
          }),
        })
      }
    }
  }

  qs.push({
    id: 'next_step', kind: 'text', label: 'What should happen next meeting?',
    answered: e => filled(e.next_step),
    patch: (e, v) => ({ next_step: v }),
  })

  qs.push({
    id: 'evidence', kind: 'photo', label: 'Show it: add a photo of the work, or a link to it.',
    answered: e => filled(e.photo_url) || filled(e.project_link),
    patch: (e, v) => (v.photo_url ? { photo_url: v.photo_url } : { project_link: v.project_link }),
  })

  return qs
}

// The next unanswered question, or null when the entry is complete.
export function nextQuestion(entry, ctx) {
  return entryQuestions(entry, ctx).find(q => !q.answered(entry)) || null
}

export function questionsLeft(entry, ctx) {
  return entryQuestions(entry, ctx).filter(q => !q.answered(entry)).length
}

// Every label EN Helper can read out, for scripts/make-question-audio.mjs.
// Mentor names and project names aren't read, only the questions.
export function allQuestionLabels() {
  const labels = new Set([
    'What did you do?', 'Why did it matter?', 'Why did it matter? Say it in your own words.',
    'How engaged were you?', 'Which project was this for?', 'Did a mentor help?',
    'Which mentor helped?', 'How did they help?', 'What happened today?',
    'What should happen next meeting?', 'Show it: add a photo of the work, or a link to it.',
    ...['Very', 'Somewhat', 'Not'].map(engagementNoteLabel),
  ])
  for (const s of SIGNALS) for (const q of s.questions) labels.add(q.label)
  return [...labels]
}
