import { useState, useEffect, useRef } from 'react'
import { ScanLine } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { usePermissions } from '../hooks/usePermissions'
import { recordBadgeScan } from '../lib/badgeScan'

// The box a USB badge scanner types into. The scanner is a keyboard as far as
// the browser knows: it types the badge number and presses Enter. So this is a
// plain text input, visible on purpose — whoever is watching sees the number
// arrive and the answer underneath, which is how they know the scan worked.
//
// `sticky` is for the kiosk: nobody is using the screen for anything else, so
// focus is pulled back whenever it wanders. In the manager it isn't, because
// a lead typing a reason elsewhere shouldn't have the cursor stolen.
export default function BadgeScanInput({ onScanned, sticky = false, large = false }) {
  const { username } = useUser()
  const { myTeamNumber } = usePermissions()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [recent, setRecent] = useState([])
  const inputRef = useRef(null)
  const clearTimer = useRef(null)

  const focus = () => inputRef.current?.focus({ preventScroll: true })

  useEffect(() => {
    focus()
    if (!sticky) return
    const id = setInterval(() => {
      if (document.activeElement !== inputRef.current) focus()
    }, 2000)
    return () => clearInterval(id)
  }, [sticky])

  useEffect(() => () => clearTimeout(clearTimer.current), [])

  const submit = async () => {
    const badge = value.trim()
    setValue('')
    if (!badge || busy) return
    setBusy(true)
    const r = await recordBadgeScan(badge, { username, teamNumber: myTeamNumber })
    setBusy(false)
    setResult(r)
    if (r.ok) {
      setRecent(prev => [{ key: Date.now(), name: r.name, code: r.code, already: !!r.already }, ...prev].slice(0, 10))
      onScanned?.(r)
    }
    clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => setResult(null), large ? 4000 : 6000)
    focus()
  }

  const tone = !result ? null
    : !result.ok ? 'bg-red-50 text-red-700 border-red-200'
      : result.already ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-green-50 text-green-700 border-green-200'
  const message = !result ? null
    : !result.ok ? result.error
      : result.already ? `${result.name} already scanned in at ${result.code}`
        : `✓ ${result.name} — ${result.code}`

  return (
    <div className={`bg-white rounded-xl shadow-sm ${large ? 'p-6 space-y-4' : 'p-3 space-y-2'}`}>
      <label className={`flex items-center gap-2 font-semibold text-gray-600 ${large ? 'text-lg' : 'text-xs'}`}>
        <ScanLine size={large ? 22 : 14} /> Scan badge
      </label>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        onBlur={() => { if (sticky) setTimeout(focus, 0) }}
        placeholder={busy ? 'Saving…' : 'Scan a badge, or type its number and press Enter'}
        autoComplete="off"
        spellCheck={false}
        className={`w-full border rounded-lg font-mono focus:ring-2 focus:ring-brand-blue focus:border-transparent ${
          large ? 'text-2xl px-4 py-3' : 'text-sm px-2 py-1.5'}`}
      />
      {message && (
        <div className={`border rounded-lg font-semibold ${tone} ${large ? 'text-3xl px-4 py-4 text-center' : 'text-sm px-3 py-2'}`}>
          {message}
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <p className={`text-gray-400 ${large ? 'text-sm' : 'text-[11px]'}`}>Recent scans</p>
          <ul className={`divide-y divide-gray-100 ${large ? 'text-base' : 'text-xs'}`}>
            {recent.map(s => (
              <li key={s.key} className="flex items-center justify-between py-1 gap-2">
                <span className="text-gray-700 truncate">{s.name}</span>
                <span className={`font-mono shrink-0 ${s.already ? 'text-amber-600' : 'text-gray-500'}`}>
                  {s.already ? 'again · ' : ''}{s.code}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
