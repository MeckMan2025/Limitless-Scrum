// The fixed choices on a notebook entry, shared by the typed form and the
// EN Helper's AI step. The AI may only pick from these lists, so they live in
// one place: scripts/sync-notebook-schema.mjs copies them (with the signals)
// into the notebook-voice function, which checks every answer against them.

export const CATEGORIES = ['Technical', 'Programming', 'Business', 'Custom']

export const WHY_OPTIONS = [
  'Directly advances the robot design',
  'Improves autonomous performance',
  'Supports outreach/business goals',
  'Fixes a critical bug or issue',
  'Prepares for upcoming competition',
  'Improves team workflow/process',
  'Research & learning',
  'Other',
]
