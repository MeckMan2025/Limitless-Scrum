import { useState, useEffect, useRef } from 'react'
import { Mic, Square, Loader2, Volume2, VolumeX, Camera, ChevronLeft, Keyboard } from 'lucide-react'
import { startRecording, toWav } from './recorder'
import { answerByVoice } from './voiceEntries'
import { speakQuestion, stopVoice, readAloudOn, setReadAloud } from './questionVoice'
import { uploadNotebookPhoto } from '../lib/notebookPhoto'

// One follow-up question. The question shows, is read out, and the student
// answers the way that suits it: talking for anything open, a tap for a
// choice (or talking, if they'd rather), and the camera for the last one.
// Every answer goes straight to onAnswer, which saves it and moves on; the
// card underneath echoes what was heard, so a mishearing is one tap to redo.

const HAND = { fontFamily: "'Kalam', cursive" }
const ANSWER_SECONDS = 90
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function QuestionStep({ entry, question: q, done, left, heard, onAnswer, onBack, onRedoHeard }) {
  const [mode, setMode] = useState('ready') // ready | recording | listening | saving
  const [seconds, setSeconds] = useState(0)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState([])
  const [link, setLink] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(!readAloudOn())
  const recRef = useRef(null)
  const timerRef = useRef(null)

  // A fresh card for every question, read out as it appears.
  useEffect(() => {
    setMode('ready'); setTyping(false); setText(''); setLink(''); setError(''); setUploading(false)
    setPicked(q.kind === 'multi' ? [...(entry.signals || [])] : [])
    speakQuestion(q.label)
    return () => stopVoice()
  }, [q.id]) // eslint-disable-line

  useEffect(() => () => { clearInterval(timerRef.current); recRef.current?.cancel() }, [])

  const answer = async (value) => {
    setMode('saving')
    setError('')
    try {
      await onAnswer(value)
    } catch {
      setMode('ready')
      setError("Couldn't save that answer. Check your signal and try again.")
    }
  }

  const startTalking = async () => {
    setError('')
    stopVoice()
    try {
      recRef.current = await startRecording()
    } catch (err) {
      setError(err?.name === 'NotAllowedError'
        ? 'EN Helper needs your microphone. Tap the mic again and choose Allow.'
        : "Your phone wouldn't start recording. Try again.")
      return
    }
    setSeconds(0)
    setMode('recording')
    const began = Date.now()
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000)
      setSeconds(s)
      if (s >= ANSWER_SECONDS) stopTalking()
    }, 250)
  }

  const stopTalking = async () => {
    clearInterval(timerRef.current)
    const rec = recRef.current
    recRef.current = null
    if (!rec) return
    const raw = await rec.stop()
    if (raw.size < 1500) { setMode('ready'); setError("That was too short to hear. Tap the mic and try again."); return }
    setMode('listening')
    try {
      const wav = (await toWav(raw)) || raw
      const choices = q.kind === 'choice' ? q.options.map(o => o.label) : []
      const { text: said, option } = await answerByVoice(entry.id, q.label, choices, wav)
      if (!said) { setMode('ready'); setError("That one didn't come through. Tap the mic and try again."); return }
      if (q.kind === 'choice') {
        const match = q.options.find(o => o.label === option)
        if (!match) { setMode('ready'); setError(`Heard "${said}", but it doesn't match a choice. Tap the closest one.`); return }
        return answer(match.value)
      }
      return answer(said)
    } catch {
      setMode('ready')
      setError("Couldn't reach the notebook to hear that. Check your signal, or type it instead.")
    }
  }

  const pickPhoto = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    uploadNotebookPhoto(file)
      .then(url => answer({ photo_url: url }))
      .catch(err => setError(err.message))
      .finally(() => setUploading(false))
  }

  const busy = mode !== 'ready'
  const total = done + left

  return (
    <div className="space-y-3">
      {/* Where they are, and the way back to the last answer. */}
      <div className="flex items-center gap-2">
        {onBack ? (
          <button onClick={onBack} disabled={busy} className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-white/70" aria-label="Previous question">
            <ChevronLeft size={20} />
          </button>
        ) : <span className="w-7" />}
        <div className="flex-1 h-1.5 rounded-full bg-white/80 overflow-hidden">
          <div className="h-full bg-brand-yellow-dark transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-gray-500 shrink-0">{left} to go</span>
      </div>

      {heard && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs text-green-800 flex items-start gap-2">
          <span className="flex-1">Got it: “{heard}”</span>
          {onRedoHeard && <button onClick={onRedoHeard} disabled={busy} className="font-semibold underline shrink-0">Redo</button>}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {q.hint && q.id.startsWith('signal:') && <p className="text-xs font-semibold text-gray-400 mb-1">{q.hint}</p>}
            <h2 className="text-xl text-gray-800 leading-snug" style={HAND}>{q.label}</h2>
            {q.hint && !q.id.startsWith('signal:') && <p className="text-xs text-gray-400 mt-1">{q.hint}</p>}
          </div>
          <button onClick={() => speakQuestion(q.label, { force: true })} aria-label="Read the question again"
            className="p-2 rounded-lg bg-gray-100 text-gray-500 shrink-0"><Volume2 size={16} /></button>
          <button onClick={() => { setReadAloud(muted); setMuted(!muted) }} aria-label={muted ? 'Read questions aloud' : 'Stop reading questions aloud'}
            className={`p-2 rounded-lg shrink-0 ${muted ? 'bg-gray-100 text-gray-400' : 'bg-brand-yellow/40 text-gray-600'}`}>
            {muted ? <VolumeX size={16} /> : <span className="text-[10px] font-semibold leading-4 block">AUTO</span>}
          </button>
        </div>

        {/* Talking: anything open, and choices for those who'd rather say it. */}
        {(q.kind === 'text' && !typing) && (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              onClick={mode === 'recording' ? stopTalking : startTalking}
              disabled={mode === 'listening' || mode === 'saving'}
              aria-label={mode === 'recording' ? 'Stop recording' : 'Start recording'}
              className={`w-24 h-24 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 ${
                mode === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-gray-800'
              } disabled:opacity-60`}
            >
              {mode === 'listening' || mode === 'saving' ? <Loader2 className="text-white animate-spin" size={36} />
                : mode === 'recording' ? <Square className="text-white" size={32} fill="white" />
                  : <Mic className="text-white" size={40} />}
            </button>
            <p className="text-sm text-gray-500">
              {mode === 'recording' ? `${clock(seconds)}  ·  tap to stop`
                : mode === 'listening' ? 'Listening…' : mode === 'saving' ? 'Saving…' : 'Tap to answer'}
            </p>
            {mode === 'ready' && (
              <button onClick={() => setTyping(true)} className="flex items-center gap-1 text-xs text-gray-400 underline">
                <Keyboard size={13} /> Type instead
              </button>
            )}
          </div>
        )}

        {q.kind === 'text' && typing && (
          <div className="space-y-2">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
              className="w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-yellow focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={() => setTyping(false)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Talk instead</button>
              <button onClick={() => answer(text.trim())} disabled={!text.trim() || busy}
                className="flex-1 py-2.5 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-40 font-semibold text-gray-800">
                {mode === 'saving' ? 'Saving…' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {q.kind === 'choice' && (
          <div className="space-y-2">
            {q.options.map(o => (
              <button key={o.value} onClick={() => answer(o.value)} disabled={busy}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-brand-yellow-dark hover:bg-brand-yellow/10 text-sm font-medium text-gray-700 disabled:opacity-50">
                {o.label}
              </button>
            ))}
            <div className="flex justify-center pt-1">
              <button onClick={mode === 'recording' ? stopTalking : startTalking} disabled={mode === 'listening' || mode === 'saving'}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-full ${mode === 'recording' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {mode === 'listening' ? <><Loader2 size={13} className="animate-spin" /> Listening…</>
                  : mode === 'recording' ? <><Square size={11} fill="white" /> {clock(seconds)} · tap to stop</>
                    : <><Mic size={13} /> Or say it</>}
              </button>
            </div>
          </div>
        )}

        {q.kind === 'multi' && (
          <div className="space-y-2">
            {q.options.map(o => {
              const on = picked.includes(o.value)
              return (
                <button key={o.value} onClick={() => setPicked(p => on ? p.filter(v => v !== o.value) : [...p, o.value])}
                  aria-pressed={on}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium ${
                    on ? 'border-brand-yellow-dark bg-brand-yellow/25 text-gray-800' : 'border-gray-200 text-gray-600'
                  }`}>
                  {o.label}
                </button>
              )
            })}
            <button onClick={() => answer(picked)} disabled={!picked.length || busy}
              className="w-full py-3 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-40 font-semibold text-gray-800">
              {mode === 'saving' ? 'Saving…' : picked.length ? 'Next' : 'Pick at least one'}
            </button>
          </div>
        )}

        {q.kind === 'photo' && (
          <div className="space-y-3">
            <label className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark font-semibold text-gray-800 ${busy || uploading ? 'opacity-50' : ''}`}>
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              {uploading ? 'Uploading…' : 'Take or add a photo'}
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} disabled={busy || uploading} />
            </label>
            <div className="flex gap-2">
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="Or paste a link to the work"
                inputMode="url" className="flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-yellow focus:outline-none" />
              <button onClick={() => answer({ project_link: link.trim() })} disabled={!/^https?:\/\/\S+\.\S+/.test(link.trim()) || busy}
                className="px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-40">Use link</button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}
