// When a task was finished.
//
// A task can be marked done four different ways — dragged into the Done
// column, the Mark Done button on a card, the status control inside the task
// popup, and the one on the dashboard — so the stamp lives here rather than
// being written out four times and drifting.

// Both spellings exist in the data: the drag handler writes the column id,
// which is 'done', while the Mark Done button writes 'completed'.
const DONE = ['done', 'completed']

export function isDone(status) {
  return DONE.includes(String(status || '').toLowerCase())
}

// The fields to send when a task's status changes.
//
// Moving INTO done stamps the moment. Moving back OUT clears it, because a
// task that is open again has no completion date — leaving the old one would
// claim it was finished when it is sitting in Doing.
//
// Re-completing something re-stamps it. The question people ask is "when did
// this get done", and the answer is the time it was last finished, not the
// first time somebody ticked it.
export function completionFields(status) {
  return {
    status,
    completed_at: isDone(status) ? new Date().toISOString() : null,
  }
}

// ── When it was finished, against when it was due ─────────────────────────

// The local calendar day of a timestamp, as YYYY-MM-DD. A task finished at
// eleven at night was finished that day, not the next one in UTC.
export function doneDay(completedAt) {
  if (!completedAt) return null
  const d = new Date(completedAt)
  if (isNaN(d)) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Days after the due date a task was finished: negative is early, zero is on
// the day, positive is late. Null when either date is missing — tasks done
// before the stamp existed have no answer, and saying "on time" would be a
// guess.
export function daysLate(dueDate, completedAt) {
  const done = doneDay(completedAt)
  const due = String(dueDate || '').slice(0, 10)
  if (!done || !due) return null
  const a = new Date(due + 'T00:00:00'), b = new Date(done + 'T00:00:00')
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

export function latenessLabel(n) {
  if (n == null) return ''
  if (n === 0) return 'on the day'
  const k = Math.abs(n)
  return `${k} day${k === 1 ? '' : 's'} ${n < 0 ? 'early' : 'late'}`
}

// "Oct 20", from the completion stamp.
export function prettyDone(completedAt) {
  const day = doneDay(completedAt)
  if (!day) return ''
  return new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
