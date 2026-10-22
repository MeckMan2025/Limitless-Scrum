import { SIGNALS, visibleQuestions } from '../data/notebookSignals'

// The "what happened today" picker and the follow-up questions behind it.
//
// Both live here so the notebook form stays about the flow and this stays
// about the questions. Neither knows what the signals are — that is
// data/notebookSignals.js — so a new signal appears in both with no edit here.

// Ticking a card is the whole interaction, so the whole card is the target:
// a checkbox-sized hit area is miserable on a phone at the end of a meeting.
export default function SignalPicker({ selected, onChange }) {
  const toggle = (key) => {
    onChange(selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key])
  }

  return (
    <div className="space-y-2">
      {SIGNALS.map(sig => {
        const on = selected.includes(sig.key)
        return (
          <button
            key={sig.key}
            type="button"
            onClick={() => toggle(sig.key)}
            aria-pressed={on}
            className={`w-full text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${
              on
                ? 'border-brand-yellow-dark bg-brand-yellow/25'
                : 'border-gray-200 bg-white/70 hover:bg-brand-blue/15'
            }`}
          >
            <span className="flex items-start gap-2.5">
              <span className="text-lg leading-none mt-0.5 shrink-0">{sig.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-700">{sig.label}</span>
                <span className="block text-[11px] text-gray-400 leading-snug">{sig.helper}</span>
              </span>
              <span
                className={`ml-auto shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-bold ${
                  on ? 'border-brand-yellow-dark bg-brand-yellow-dark text-white' : 'border-gray-300 text-transparent'
                }`}
              >
                ✓
              </span>
            </span>
          </button>
        )
      })}

      {/* Says what is actually needed, and why only one. Asking for "at least
          one" and then nudging for more is how you get boxes ticked that
          weren't true, which is worse than a thin entry. */}
      <p className="text-[11px] text-gray-400 pt-1">
        {selected.length === 0
          ? 'Pick at least one — whichever genuinely happened. One is plenty.'
          : 'Only tick what actually happened. One true answer beats five that weren’t.'}
      </p>
    </div>
  )
}

// The questions for one signal. Only the ones that apply are rendered — a
// follow-up that depends on an earlier answer stays out of the way until that
// answer calls for it.
export function SignalQuestions({ signal, answers, onChange }) {
  const set = (id, value) => onChange({ ...answers, [id]: value })
  const shown = visibleQuestions(signal, answers)

  return (
    <div className="space-y-3">
      {shown.map(q => (
        <div key={q.id}>
          <label className="text-sm font-medium text-gray-600 block mb-1">{q.label}</label>

          {q.type === 'text' ? (
            <input
              type="text"
              value={answers[q.id] || ''}
              onChange={e => set(q.id, e.target.value)}
              placeholder="A line is plenty"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map(opt => {
                const on = answers[q.id] === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    // Tapping the chosen one again clears it: every question
                    // here is optional, and without this a mis-tap can't be
                    // taken back.
                    onClick={() => set(q.id, on ? '' : opt)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      on
                        ? 'border-brand-yellow-dark bg-brand-yellow/30 text-gray-800'
                        : 'border-gray-200 bg-white/70 text-gray-500 hover:bg-brand-blue/15'
                    }`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <p className="text-[11px] text-gray-400">
        Skip anything you'd rather not answer — none of this is required.
      </p>
    </div>
  )
}
