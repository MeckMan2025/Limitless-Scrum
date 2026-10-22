import { useState } from 'react'
import { Mic, Sparkles, X, Loader2 } from 'lucide-react'
import { restHeaders } from '../lib/restHeaders'

// How an EN Helper (voice) entry reads in the notebook: what the student said,
// word for word, beside the AI's written-up version. Both are always shown so
// anyone reading, judges included, can see the AI wrote up the student's work
// and didn't do it for them.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

export const isVoice = (entry) => entry?.source === 'voice'

// One line for places with no room for both versions (the list view).
export function voiceStatusLine(entry) {
  if (entry.complete === false) return "Voice entry: not finished yet. It counts once every question is answered in EN Helper."
  if (entry.ai_status === 'empty') return 'Voice entry: no speech was heard in the recording.'
  if (entry.ai_status !== 'done') return 'Voice entry: being written up…'
  return ''
}

export function VoiceTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-pink-700 bg-brand-yellow/40 rounded-full px-2 py-0.5">
      <Mic size={10} /> Voice · AI-assisted
    </span>
  )
}

export function VoiceSides({ entry }) {
  const pending = entry.ai_status !== 'done' && entry.ai_status !== 'empty'
  if (entry.complete === false) {
    return (
      <p className="text-sm text-gray-500 italic bg-white/80 rounded-lg border border-gray-200 p-2.5">
        Not finished yet. It counts once every question is answered in EN Helper.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-gray-200 bg-white/90 p-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
          <Mic size={11} /> What I said
        </p>
        <p className="text-sm text-gray-700 whitespace-pre-line break-words">
          {entry.transcript
            || (entry.ai_status === 'empty' ? 'No speech was heard in this recording.' : <span className="text-gray-400 italic">Listening to the recording…</span>)}
        </p>
      </div>
      <div className="rounded-lg border border-pink-200 bg-brand-yellow/10 p-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-pink-700 mb-1">
          <Sparkles size={11} /> AI-polished
        </p>
        <p className="text-sm text-gray-800 whitespace-pre-line break-words">
          {entry.polished
            || (pending ? <span className="text-gray-400 italic">Being written up…</span> : <span className="text-gray-400">Nothing to write up.</span>)}
        </p>
      </div>
    </div>
  )
}

// Fixing the written-up version. The transcript is the record of what was
// said, so it isn't editable here; the polished version is the student's to
// correct.
export function VoiceEntryEditor({ entry, onClose, onSaved }) {
  const [text, setText] = useState(entry.polished || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/notebook_entries?id=eq.${entry.id}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ polished: text.trim() }),
      })
      if (!res.ok) throw new Error(String(res.status))
      onSaved?.({ ...entry, polished: text.trim() })
      onClose()
    } catch {
      setError("Couldn't save. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Fix the written-up version</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5 max-h-32 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">What you said</p>
          <p className="text-xs text-gray-600 whitespace-pre-line">{entry.transcript || 'No transcript yet.'}</p>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:outline-none"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={save}
          disabled={saving || !text.trim()}
          className="w-full py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 font-semibold text-gray-700 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />} Save
        </button>
      </div>
    </div>
  )
}
