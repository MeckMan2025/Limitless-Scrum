// The stamp a badge scan leaves on an attendance record: Th10/08/2026|17:17.
//
// Day, date and 24-hour time on the team's wall clock (Central, which is CDT
// in summer), whatever time zone the scanning laptop happens to be set to.

const DAYS = { Sun: 'Su', Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa' }

const FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function badgeScanCode(date = new Date()) {
  const p = {}
  for (const { type, value } of FORMAT.formatToParts(date)) p[type] = value
  return `${DAYS[p.weekday] || p.weekday}${p.month}/${p.day}/${p.year}|${p.hour}:${p.minute}`
}

// One badge, however it arrives. Card scanners pad to a fixed width, so the
// same badge comes in as 0000000027 from the scanner and 27 when typed — both
// have to mean the same person. Leading zeros go; a badge of all zeros is "0".
export function normalizeBadge(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  return s.replace(/^0+(?=.)/, '')
}
