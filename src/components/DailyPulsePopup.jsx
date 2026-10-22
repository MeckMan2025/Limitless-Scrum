import { useEffect, useState } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { X } from 'lucide-react'

const MOODS = [
  { value: 'great',    emoji: '🙂', label: 'Great' },
  { value: 'okay',     emoji: '😐', label: 'Okay' },
  { value: 'stressed', emoji: '😓', label: 'Stressed' },
  { value: 'excited',  emoji: '🔥', label: 'Excited' },
  { value: 'tired',    emoji: '😴', label: 'Tired' },
]

const WORK_FOCUS = [
  { value: 'programming',  emoji: '💻', label: 'Programming' },
  { value: 'technical',    emoji: '🔧', label: 'Build / Technical' },
  { value: 'business',     emoji: '💰', label: 'Business' },
  { value: 'outreach',     emoji: '📣', label: 'Outreach' },
  { value: 'competition',  emoji: '🏁', label: 'Competition Prep' },
  { value: 'workshop',     emoji: '📚', label: 'Workshop / Learning' },
  { value: 'multiple',     emoji: '🤖', label: 'Multiple Areas' },
  { value: 'not_sure',     emoji: '❌', label: 'Not Sure' },
]

const FRUSTRATIONS = [
  'Organization', 'Communication', 'Deadlines', 'Scouting',
  'Competitions', 'Motivation', 'Documentation', 'Other',
]

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DailyPulsePopup({ userId, onClose, onComplete }) {
  // Mark "popup already shown today" the moment it actually mounts on screen.
  // Even if the user backgrounds the app without answering, we won't re-prompt.
  useEffect(() => {
    try { localStorage.setItem(`pulse_skipped_${todayKey()}`, '1') } catch {}
  }, [])

  const [slide, setSlide] = useState(0)
  const [mood, setMood] = useState(null)
  const [moodNote, setMoodNote] = useState('')
  const [workFocus, setWorkFocus] = useState(null)
  const [frustration, setFrustration] = useState(null)
  const [frustrationNote, setFrustrationNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const skipForToday = () => {
    try { localStorage.setItem(`pulse_skipped_${todayKey()}`, '1') } catch {}
    onClose()
  }

  const submit = async () => {
    if (!userId) { onClose(); return }
    setSubmitting(true)
    // Lock the device down immediately — even if the DB insert fails for any
    // reason (offline, server error), we don't want the popup to reappear today.
    try { localStorage.setItem(`pulse_skipped_${todayKey()}`, '1') } catch {}
    const row = {
      id: 'pulse_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      user_id: userId,
      pulse_date: todayKey(),
      mood,
      mood_note: moodNote.trim(),
      work_focus: workFocus,
      frustration,
      frustration_note: frustrationNote.trim(),
    }
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/daily_pulse`, {
        method: 'POST',
        headers: {
          ...restHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
      })
      // 409 is fine — already submitted today (unique constraint)
      if (res.ok || res.status === 409) {
        onComplete?.()
      }
    } catch {
      // Silent — user already wanted to be done; not worth interrupting
    }
    setSubmitting(false)
    onClose()
  }

  const canAdvance = slide === 0 ? !!mood
                   : slide === 1 ? !!workFocus
                   :               !!frustration

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">Daily Pulse</span>
          <button
            onClick={skipForToday}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded"
          >
            Skip for today
          </button>
        </div>

        {/* Slides */}
        <div className="px-5 pb-3">
          {slide === 0 && (
            <Slide
              question="How are you feeling today?"
              options={MOODS}
              selected={mood}
              onSelect={setMood}
              note={moodNote}
              onNoteChange={setMoodNote}
              notePlaceholder="Anything you want leaders to know? (anonymous)"
            />
          )}
          {slide === 1 && (
            <Slide
              question="What are you planning to work on today?"
              options={WORK_FOCUS}
              selected={workFocus}
              onSelect={setWorkFocus}
            />
          )}
          {slide === 2 && (
            <Slide
              question="What has been frustrating lately?"
              options={FRUSTRATIONS.map(f => ({ value: f.toLowerCase(), label: f }))}
              selected={frustration}
              onSelect={setFrustration}
              note={frustrationNote}
              onNoteChange={setFrustrationNote}
              notePlaceholder="More details? (anonymous, optional)"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <ProgressDots count={3} active={slide} />
          <div className="flex gap-2">
            {slide > 0 && (
              <button
                onClick={() => setSlide(slide - 1)}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
            )}
            {slide < 2 && (
              <button
                onClick={() => canAdvance && setSlide(slide + 1)}
                disabled={!canAdvance}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  canAdvance
                    ? 'bg-gradient-to-r from-brand-blue-dark to-brand-yellow-dark text-white shadow hover:shadow-md'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Continue
              </button>
            )}
            {slide === 2 && (
              <button
                onClick={() => canAdvance && submit()}
                disabled={!canAdvance || submitting}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  canAdvance && !submitting
                    ? 'bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark text-white shadow hover:shadow-md'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Sending…' : 'Done'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide({ question, options, selected, onSelect, note, onNoteChange, notePlaceholder }) {
  return (
    <div className="space-y-3 py-2">
      <h2 className="text-base font-semibold text-gray-700 text-center px-2">{question}</h2>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => {
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={`px-3 py-3 rounded-xl text-left text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-gradient-to-r from-brand-blue/80 to-brand-yellow/80 text-gray-800 shadow-inner ring-2 ring-brand-blue-dark/40'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
              }`}
            >
              {opt.emoji && <span className="mr-2">{opt.emoji}</span>}
              {opt.label}
            </button>
          )
        })}
      </div>
      {onNoteChange && (
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder={notePlaceholder}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-dark/30"
        />
      )}
    </div>
  )
}

function ProgressDots({ count, active }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full transition-all ${
            i === active ? 'bg-brand-blue-dark w-6' : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  )
}
