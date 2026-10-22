import { restHeaders } from './restHeaders'
import { stampStored, storedTeamScope } from './teamScope'
import { SCOUTING_FIELDS } from '../data/scoutingFields'

// Moving scouting rows between devices as a file — AirDrop at a competition,
// where the Wi-Fi is the first thing to go.
//
// Sending hands a .json file to the share sheet, which on an iPhone or iPad
// is where AirDrop lives (and Messages, Mail, Files). Where the browser has no
// share sheet for files it downloads instead, so the file can still be moved
// by hand. Receiving reads that file back and saves any rows this database
// doesn't have yet; a row already here is left alone, so taking the same file
// twice, or a file that overlaps your own, adds nothing twice.

const TABLE = 'match_scouting'
const KIND = 'scrum-scouting'

// Only the columns the form writes travel. Anything else in a file is
// ignored, so a file can't set columns the form never would.
const KEYS = ['id', 'scout', 'created_at', ...SCOUTING_FIELDS.map(f => f.key)]

const pick = (r) => Object.fromEntries(KEYS.filter(k => k in r).map(k => [k, r[k]]))

export async function loadScoutingRows() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${url}/rest/v1/${TABLE}?${storedTeamScope('owner_team')}&select=*&order=created_at.desc`, { headers: restHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// 'shared' | 'downloaded' | 'cancelled'
export async function sendScouting(rows) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  const name = `scouting-${stamp}.json`
  const body = JSON.stringify({ kind: KIND, version: 1, exported_at: new Date().toISOString(), rows: rows.map(pick) })
  const file = new File([body], name, { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Scouting data' })
      return 'shared'
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if (err?.name === 'AbortError') return 'cancelled'
      throw err
    }
  }

  const href = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  URL.revokeObjectURL(href)
  return 'downloaded'
}

// Saves the rows in a received file. Returns { added, already }.
export async function receiveScouting(file) {
  let data
  try { data = JSON.parse(await file.text()) } catch { throw new Error("That file isn't scouting data.") }
  if (data?.kind !== KIND || !Array.isArray(data.rows)) throw new Error("That file isn't scouting data.")

  // Received scouting becomes this team's: owner_team is never taken from
  // the file (pick() drops it), only from who is saving it.
  const rows = data.rows.map(pick).filter(r => r.id && r.team_number && r.match_number)
    .map(r => stampStored(r, 'owner_team'))
  if (!rows.length) return { added: 0, already: 0 }

  const url = import.meta.env.VITE_SUPABASE_URL
  // Naming the columns lets rows from an older file, missing a field added
  // since, go in alongside newer ones — the missing field takes its default.
  const res = await fetch(`${url}/rest/v1/${TABLE}?columns=${[...KEYS, 'owner_team'].join(',')}&on_conflict=id`, {
    method: 'POST',
    headers: {
      ...restHeaders(),
      'Content-Type': 'application/json',
      // Rows already saved are skipped, and only the new ones come back.
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(await res.text())
  const added = (await res.json()).length
  return { added, already: rows.length - added }
}
