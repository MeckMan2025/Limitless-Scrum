import { useState, useEffect } from 'react'
import { lazyHeadersWith } from '../lib/restHeaders'
import { useUser } from '../contexts/UserContext'
import { triggerPush } from '../utils/pushHelper'
import { fetchBirthdayEvents, birthdaysOn, localToday } from '../lib/birthdays'

const REST_URL = import.meta.env.VITE_SUPABASE_URL
const REST_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const REST_JSON = lazyHeadersWith({ 'Content-Type': 'application/json' })

// "Happy Birthday Lily!" — or "Lily and Sam" when two share a day.
export function joinNames(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Is this birthday the person looking at the screen? "Happy Birthday Kayden"
// popping up for Kayden reads oddly, so they get the confetti but no ping.
const isSelf = (name, username) => {
  const a = (name || '').trim().toLowerCase()
  const b = (username || '').trim().toLowerCase()
  if (!a || !b) return false
  return a === b || b.startsWith(a + ' ') || a.startsWith(b + ' ')
}

export default function BirthdayConfetti() {
  const { username, user } = useUser()
  const [today] = useState(localToday)
  const [birthdays, setBirthdays] = useState([])
  const [open, setOpen] = useState(false)
  const dismissKey = `scrum-bday-dismissed-${today}`
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1' } catch { return false }
  })

  useEffect(() => {
    let active = true
    fetchBirthdayEvents().then(events => {
      if (active) setBirthdays(birthdaysOn(events, today))
    })
    return () => { active = false }
  }, [today])

  // One notification per person per birthday per year. The id is derived from
  // the date and the reader, so the insert is a no-op the second time round —
  // no need to remember anywhere whether this already fired.
  useEffect(() => {
    if (!user?.id || birthdays.length === 0) return
    const others = birthdays.filter(b => !isSelf(b.name, username))
    if (others.length === 0) return
    const names = joinNames(others.map(b => b.name))
    const notif = {
      id: `bday-${today}-${user.id.slice(0, 8)}`,
      user_id: user.id,
      type: 'birthday',
      title: `🎉 Happy Birthday ${names}!`,
      body: others.length === 1
        ? `It's ${names}'s birthday today — go say something nice.`
        : `It's their birthday today — go say something nice.`,
    }
    fetch(`${REST_URL}/rest/v1/notifications`, {
      method: 'POST', headers: REST_JSON, body: JSON.stringify(notif),
    })
      .then(res => {
        // 409 = already sent today; anything else new enough to push.
        if (res.ok) triggerPush(notif)
      })
      .catch(() => {})
  }, [birthdays, user?.id, username, today])

  if (birthdays.length === 0 || dismissed) return null

  const names = joinNames(birthdays.map(b => b.name))

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-white rounded-2xl shadow-xl border-2 border-brand-yellow px-4 py-3 max-w-[15rem] animate-in">
          <p className="text-sm font-bold text-gray-800">🎉 Happy Birthday {names}!</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {birthdays.length === 1 ? "It's their day — go say something nice." : "It's their day — go say something nice."}
          </p>
          <button
            onClick={() => {
              setDismissed(true)
              try { localStorage.setItem(dismissKey, '1') } catch { /* private mode */ }
            }}
            className="mt-2 text-[11px] text-gray-400 hover:text-gray-600"
          >
            Hide for today
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        title={`Happy Birthday ${names}!`}
        aria-label={`Happy Birthday ${names}`}
        className="text-3xl leading-none drop-shadow-md hover:scale-110 active:scale-95 transition-transform animate-bounce"
      >
        🎉
      </button>
    </div>
  )
}
