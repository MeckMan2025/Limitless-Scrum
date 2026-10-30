// Who we are, and how a visiting team's login is put together.

// Our team number. Everything that says "home team" keys off this.
export const HOME_TEAM_NUMBER = '9082'
export const HOME_TEAM_NAME = "Limitless Scrum"

export const isHomeTeamNumber = (value) => String(value || '').trim() === HOME_TEAM_NUMBER

// The address a visiting team's account actually signs in with.
//
// One coach often runs more than one team, and an auth account is keyed by
// address alone — so the same coach email cannot be two accounts. The team
// number is folded into the address as a plus-tag:
//
//   coach@school.org  +  team 12345   ->   coach+team12345@school.org
//
// Gmail, Microsoft 365 and iCloud all deliver a plus-tagged address to the
// plain inbox, so it stays a REAL address: the coach can be written to, and a
// password reset still reaches them. That is the whole reason not to invent
// something like team12345@teams.radical, which can never receive anything.
//
// The coach types their ordinary address and their team number; this is built
// for them, so nobody has to know the tag exists.
export function teamAuthEmail(email, teamNumber) {
  const mail = String(email || '').trim().toLowerCase()
  const num = String(teamNumber || '').trim()
  const at = mail.lastIndexOf('@')
  if (!mail || !num || at < 1) return mail
  const local = mail.slice(0, at)
  const domain = mail.slice(at + 1)
  // Already tagged for this team — don't tag it twice.
  if (local.endsWith(`+team${num}`)) return mail
  // A different tag was typed by hand; replace it rather than stacking.
  const base = local.includes('+') ? local.slice(0, local.indexOf('+')) : local
  return `${base}+team${num}@${domain}`
}

// Accounts created before plus-tagging. Tried in turn when the tagged address
// doesn't match, so teams added earlier keep working without being touched.
export function legacyTeamEmails(email, teamNumber) {
  const mail = String(email || '').trim().toLowerCase()
  const num = String(teamNumber || '').trim()
  return [
    mail,                              // created with the plain coach address
    num ? `team${num}@teams.radical` : '', // the original invented address
  ].filter(Boolean)
}
