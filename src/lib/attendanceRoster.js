// Who counts as a person on the attendance roster.
//
// Kept in one place because the manager (which takes attendance) and the view
// (which reports on it) have to agree — when they drifted, people showed up in
// one and not the other.

// Adults run the meeting, they don't get marked present or absent at it.
export const NON_ATTENDANCE_TAGS = ['Mentor', 'Coach']

// Team accounts and the ETS testing account are not people.
const EXCLUDED_ATT_NAMES = ['ets', 'everythingthatsscrum']

export function excludedAttName(name) {
  const n = (name || '').trim().toLowerCase()
  return EXCLUDED_ATT_NAMES.includes(n) || n.startsWith('team ')
}

// A full profile row — the tag check needs function_tags, so prefer this
// wherever profiles are loaded.
export function excludedFromAttendance(p) {
  const tags = p?.function_tags || []
  return tags.includes('Team') ||
    tags.some(t => NON_ATTENDANCE_TAGS.includes(t)) ||
    excludedAttName(p?.display_name)
}

// Names of everyone excluded by tag, for filtering records (which only carry a
// username) against a loaded profile list.
export function excludedNamesFrom(profiles) {
  return new Set(
    (profiles || [])
      .filter(excludedFromAttendance)
      .map(p => p.display_name)
      .filter(Boolean)
  )
}
