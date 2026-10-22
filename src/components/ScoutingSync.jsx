import { useRef, useState } from 'react'
import { Share, Download as Receive, Loader2 } from 'lucide-react'
import { loadScoutingRows, sendScouting, receiveScouting } from '../lib/scoutingSync'

// Send and receive scouting data as a file, for AirDrop between scouts'
// devices. Shown in Settings and next to the saved scouting rows.
//
// rows: what to send. Left out, it sends everything saved, fetched fresh.
// onReceived: told the received rows were saved, so a list can reload.
export default function ScoutingSync({ rows, onReceived, compact = false }) {
  const input = useRef(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const send = async () => {
    setBusy('send'); setNote(''); setError('')
    try {
      const out = rows ?? await loadScoutingRows()
      if (!out.length) { setNote('Nothing scouted yet to send.'); return }
      const how = await sendScouting(out)
      if (how === 'downloaded') setNote("This device has no share sheet for files, so it's downloaded — send it from your files.")
      else if (how === 'shared') setNote(`Sent ${out.length} ${out.length === 1 ? 'match' : 'matches'}.`)
    } catch (err) {
      console.error('Failed to send scouting:', err)
      setError("Couldn't send the scouting data.")
    } finally {
      setBusy('')
    }
  }

  const receive = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('receive'); setNote(''); setError('')
    try {
      const { added, already } = await receiveScouting(file)
      setNote(added
        ? `Added ${added} ${added === 1 ? 'match' : 'matches'}${already ? ` · ${already} already here` : ''}.`
        : 'Nothing new — every match in that file is already here.')
      if (added) onReceived?.()
    } catch (err) {
      console.error('Failed to receive scouting:', err)
      setError(/scouting data/.test(err.message) ? err.message : "Couldn't save that file's scouting data.")
    } finally {
      setBusy('')
    }
  }

  const btn = compact
    ? 'flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-brand-blue/20 disabled:opacity-40'
    : 'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-brand-gold/50 hover:bg-brand-gold transition-colors disabled:opacity-40'
  const size = compact ? 13 : 15

  return (
    <div className={compact ? 'contents' : 'space-y-2'}>
      <div className={compact ? 'contents' : 'flex flex-wrap gap-2'}>
        <button onClick={send} disabled={!!busy} className={btn} title="AirDrop or share the scouting data">
          {busy === 'send' ? <Loader2 size={size} className="animate-spin" /> : <Share size={size} />} AirDrop
        </button>
        <button onClick={() => input.current?.click()} disabled={!!busy} className={btn} title="Add scouting data from a file someone sent you">
          {busy === 'receive' ? <Loader2 size={size} className="animate-spin" /> : <Receive size={size} />} Receive
        </button>
        <input ref={input} type="file" accept=".json,application/json" onChange={receive} className="hidden" />
      </div>
      {(note || error) && (
        <p className={`text-xs ${error ? 'text-red-500' : 'text-gray-500'} ${compact ? 'basis-full text-right' : ''}`}>
          {error || note}
        </p>
      )}
    </div>
  )
}
