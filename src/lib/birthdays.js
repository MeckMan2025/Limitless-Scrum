import { lazyRestHeaders } from '../lib/restHeaders'
import { storedTeamScope } from '../lib/teamScope'

// Birthdays already live on the calendar as events with category 'birthday',
// so there's nothing new to fill in — this just reads them.

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = lazyRestHeaders

// Event names are free-form — "Lily's Birthday!!!!", "Ricky Naylor's birthday",
// "James Lang's Birthday! 🥳🎉", or just "Kayden". Pull the person out of it.
export function personName(raw) {
  let n = (raw || '').trim()
  n = n.replace(/[‘’']s\s+birthday.*$/iu, '')  // curly or straight apostrophe
  n = n.replace(/s?\s+birthday.*$/iu, '')                // "Braden birthday", "X's birthday"
  n = n.replace(/[\p{Extended_Pictographic}️‍]+/gu, '')  // trailing 🥳🎉
  n = n.replace(/[\s!¡.,\-–—]+$/u, '')
  return n.trim()
}

// Match on month + day. The events are one-offs dated in a single year, so
// comparing the whole date would make each birthday land exactly once, ever.
const monthDay = (isoDate) => (isoDate || '').slice(5, 10)

export function localToday() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function birthdaysOn(events, isoDate) {
  const md = monthDay(isoDate)
  if (!md) return []
  return events
    .filter(e => monthDay(e.date_key) === md)
    .map(e => ({ id: e.id, name: personName(e.name), raw: e.name }))
    .filter(b => b.name)
}

export async function fetchBirthdayEvents() {
  try {
    const res = await fetch(
      `${REST_URL}/rest/v1/calendar_events?${storedTeamScope()}&select=id,name,date_key&category=eq.birthday`,
      { headers: HEADERS }
    )
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}
