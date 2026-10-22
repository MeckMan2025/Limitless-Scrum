// Active competition season — derived automatically from the current date so
// new notebook entries are always filed under the correct season without anyone
// having to remember to bump a constant each year.
//
// FRC seasons are named "<startYear>-<endYear>" and kick off in the fall. We
// roll over to the new season in MAY (after the prior season's championship),
// so summer offseason prep is filed under the UPCOMING season, not the one that
// just ended. Adjust `ROLLOVER_MONTH` if your team's boundary differs.
const ROLLOVER_MONTH = 5 // May

function seasonForDate(now) {
  const y = now.getFullYear()
  const m = now.getMonth() + 1 // 1-12
  return m >= ROLLOVER_MONTH ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export const ACTIVE_SEASON = seasonForDate(new Date())

// When this season actually kicks off. Before it, the About the Team greets
// visitors with a holding page instead of season content, with the archive one
// tap away. Set this to your real kickoff date; it flips itself on the day.
export const SEASON_STARTS = '2026-09-13'
export const SEASON_STARTED = new Date() >= new Date(SEASON_STARTS + 'T00:00:00')
export const seasonStartLabel = () =>
  new Date(SEASON_STARTS + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// The season immediately before the active one (used for untagged/legacy entries).
export const PREVIOUS_SEASON = (() => {
  const [start, end] = ACTIVE_SEASON.split('-').map(Number)
  return `${start - 1}-${end - 1}`
})()

// The season an entry belongs to (falls back to the previous season for untagged/legacy entries)
export const seasonOf = (entry) => (entry && entry.season) || PREVIOUS_SEASON
