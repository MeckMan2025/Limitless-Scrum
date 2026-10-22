import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, GraduationCap, ExternalLink, Trash2, Pencil } from 'lucide-react'
import { SIGNAL_BY_KEY, signalsOf, answersFor, visibleQuestions } from '../data/notebookSignals'
import { thumbUrl, thumbFallback } from '../lib/photos'
import { isVoice, VoiceSides, VoiceTag } from './VoiceEntry'

// The notebook read as a notebook: a contents page, then one page per meeting
// date, turned with the arrow in the corner. The list view is still there for
// searching and filtering — this is for reading it end to end, which is what a
// judge does and what nobody could do before.

// Ruled in the team's two colours, alternating. RULE is the gap between lines —
// the contents rows are set to the same height so each date sits on a line
// instead of drifting between them.
const RULE = 36
const PAPER = {
  backgroundColor: '#ffffff',
  backgroundImage: [
    'repeating-linear-gradient(',
    `#ffffff 0px, #ffffff ${RULE - 1}px, #bfdbfe ${RULE}px,`,
    `#ffffff ${RULE + 1}px, #ffffff ${RULE * 2 - 1}px, #fbcfe8 ${RULE * 2}px`,
    ')',
  ].join(''),
}
const HAND = { fontFamily: "'Kalam', cursive" }

const ENG_DOT = { Very: 'bg-green-400', Somewhat: 'bg-amber-400', Not: 'bg-rose-400' }

// A contents page holds ten dates. A season's worth in one column is a wall,
// and a real notebook's contents runs over a few pages too.
const DATES_PER_PAGE = 10

const longDate = (d) =>
  d === 'Unknown' ? 'Undated'
    : new Date(d + 'T00:00:00').toLocaleDateString('en-US',
        { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const shortDate = (d) =>
  d === 'Unknown' ? 'Undated'
    : new Date(d + 'T00:00:00').toLocaleDateString('en-US',
        { weekday: 'short', month: 'short', day: 'numeric' })

// canEdit/onEdit/onDelete are optional: the profile and the gallery render
// this as a read-only book, and simply don't pass them.
export default function NotebookBook({ entries, projectName, canEdit, onEdit, onDelete }) {
  // One page per entry, oldest first — a notebook is read forwards, and the
  // list view already covers "what happened most recently". Sorted by date,
  // then by when it was written, so a day's entries stay in the order they
  // were put down.
  const pages = useMemo(() => {
    return [...(entries || [])].sort((a, b) => {
      const d = (a.meeting_date || '').localeCompare(b.meeting_date || '')
      return d !== 0 ? d : (a.created_at || '').localeCompare(b.created_at || '')
    })
  }, [entries])

  // The contents still lists days, because that's how anyone looks for
  // something — each one jumps to where that day's entries begin.
  const days = useMemo(() => {
    const out = []
    pages.forEach((e, i) => {
      const k = e.meeting_date || 'Unknown'
      const last = out[out.length - 1]
      if (last && last.date === k) last.count += 1
      else out.push({ date: k, count: 1, entryIndex: i })
    })
    return out
  }, [pages])

  // The contents runs over as many pages as it needs, then the entries follow.
  // Page 0..contentsPages-1 are contents; after that, one page per entry.
  const contentsChunks = useMemo(() => {
    const out = []
    for (let i = 0; i < days.length; i += DATES_PER_PAGE) out.push(days.slice(i, i + DATES_PER_PAGE))
    return out.length ? out : [[]]
  }, [days])
  const contentsPages = contentsChunks.length

  const [page, setPage] = useState(0)
  const lastPage = contentsPages + pages.length - 1
  useEffect(() => { setPage(0) }, [entries?.length]) // eslint-disable-line

  if (pages.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 shadow-sm p-8 text-center" style={PAPER}>
        <p className="text-gray-400 text-sm">Nothing written yet.</p>
      </div>
    )
  }

  const onContents = page < contentsPages
  const entry = onContents ? null : pages[page - contentsPages]
  // Where this entry sits among its own day's, so a page knows its place.
  const sameDay = entry ? pages.filter(e => e.meeting_date === entry.meeting_date) : []
  const nthOfDay = entry ? sameDay.indexOf(entry) + 1 : 0

  return (
    <div className="relative rounded-lg border border-gray-200 shadow-sm overflow-hidden" style={PAPER}>
      <div className="absolute top-0 bottom-0 left-8 w-px bg-red-300/60" />

      <div className="relative pl-12 pr-5 pb-6 min-h-[38rem]" style={{ paddingTop: RULE / 2 }}>
        {onContents ? (
          <>
            <h2 className="text-3xl text-gray-700 leading-tight" style={HAND}>
              {projectName || 'Engineering Notebook'}
            </h2>
            <p className="text-[11px] text-gray-400 mb-3">
              {days.length} {days.length === 1 ? 'meeting' : 'meetings'} ·{' '}
              {pages.length} {pages.length === 1 ? 'entry' : 'entries'}
              {contentsPages > 1 && ` · contents ${page + 1} of ${contentsPages}`}
            </p>
            <ol>
              {contentsChunks[page].map(({ date: d, count, entryIndex }) => (
                <li key={d}>
                  {/* Every other rule, so the dates breathe — and since a
                      repeat is two lines, each one lands on the blue. */}
                  <button
                    onClick={() => setPage(contentsPages + entryIndex)}
                    className="w-full flex items-baseline gap-2 text-left group"
                    style={{ height: RULE * 2 }}
                  >
                    <span className="text-lg text-gray-700 group-hover:text-gray-900" style={HAND}>
                      {shortDate(d)}
                    </span>
                    {/* Leader dots, so the eye carries from the date to its page. */}
                    <span className="flex-1 border-b border-dotted border-gray-300 translate-y-[-2px]" />
                    <span className="text-xs text-gray-400 shrink-0">
                      {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                    <span className="text-sm text-gray-400 shrink-0 w-8 text-right">
                      {contentsPages + entryIndex + 1}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            {/* Everything on this page is a whole number of ruled lines
                tall — heading, blank, paragraph, blank — so the writing sits
                on the rules instead of drifting between them. Any margin that
                isn't a multiple of RULE breaks that, which is why there are no
                space-y utilities here. */}
            <div className="flex items-baseline gap-2" style={{ lineHeight: `${RULE}px` }}>
              <h2 className="text-2xl text-gray-700 flex-1 min-w-0" style={HAND}>
                {longDate(entry.meeting_date)}
              </h2>
              {canEdit?.(entry) && (
                <span className="flex items-center gap-2 shrink-0">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(entry)}
                      title="Edit this entry"
                      className="text-gray-300 hover:text-brand-blue-dark transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => {
                        // The book is read by turning pages, so stepping back
                        // one keeps you where you were rather than stranding
                        // you on the page that just stopped existing.
                        onDelete(entry)
                        setPage(p => Math.max(0, p - 1))
                      }}
                      title="Delete this entry"
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400" style={{ lineHeight: `${RULE}px` }}>
              {entry.username}
              <span className="mx-1.5 text-gray-300">·</span>
              {entry.category === 'Custom' ? (entry.custom_category || 'Custom') : entry.category}
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="inline-flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${ENG_DOT[entry.engagement] || 'bg-gray-300'}`} />
                {entry.engagement}
              </span>
              {sameDay.length > 1 && (
                <>
                  <span className="mx-1.5 text-gray-300">·</span>
                  {nthOfDay} of {sameDay.length} that day
                </>
              )}
            </p>

            {/* A voice entry is read as both versions side by side; see
                VoiceEntry.jsx for why. A typed one is written on the rules. */}
            {isVoice(entry) ? (
              <div style={{ marginTop: RULE / 2 }}>
                <VoiceTag />
                <div className="mt-2"><VoiceSides entry={entry} /></div>
              </div>
            ) : (
              <p className="text-lg text-gray-800" style={{ lineHeight: `${RULE}px`, marginTop: RULE }}>
                {entry.what_did}
              </p>
            )}

            {entry.why_option && (
              <p className="text-base text-gray-600" style={{ lineHeight: `${RULE}px`, marginTop: RULE }}>
                <span className="text-gray-400">Why it mattered — </span>
                {entry.why_option === 'Other' ? (entry.why_note || 'Other') : entry.why_option}
              </p>
            )}

            {entry.engagement_note && (
              <p className="text-base text-gray-600 italic" style={{ lineHeight: `${RULE}px` }}>
                “{entry.engagement_note}”
              </p>
            )}

            {/* A voice entry only says a mentor helped when the student said
                so. Not mentioning one isn't the same as doing it alone. */}
            {(!isVoice(entry) || entry.mentor_help) && (
            <p className="text-sm text-gray-400 flex items-center gap-1 flex-wrap"
               style={{ lineHeight: `${RULE}px`, marginTop: RULE }}>
              {entry.mentor_help ? (
                <>
                  <GraduationCap size={13} className="text-amber-500" />
                  Mentor helped{entry.mentor_name ? ` — ${entry.mentor_name}` : ''}
                  {entry.mentor_note ? `: ${entry.mentor_note}` : ''}
                </>
              ) : 'Done on their own'}
            </p>
            )}

            {/* What happened that day. An older entry has none of this and
                simply shows nothing extra. */}
            {signalsOf(entry).length > 0 && (
              <div style={{ marginTop: RULE }}>
                {signalsOf(entry).map(key => {
                  const sig = SIGNAL_BY_KEY[key]
                  const a = answersFor(entry, key)
                  const said = visibleQuestions(sig, a)
                    .map(q => a[q.id])
                    .filter(v => v && String(v).trim())
                  return (
                    <p key={key} className="text-base text-gray-600" style={{ lineHeight: `${RULE}px` }}>
                      <span className="mr-1">{sig.emoji}</span>
                      <span className="text-gray-700">{sig.label}</span>
                      {said.length > 0 && (
                        <span className="text-gray-500"> — {said.join(' · ')}</span>
                      )}
                    </p>
                  )
                })}
              </div>
            )}

            {entry.next_step && (
              <p className="text-base text-gray-600" style={{ lineHeight: `${RULE}px`, marginTop: RULE }}>
                <span className="text-gray-400">Next — </span>
                {entry.next_step}
              </p>
            )}

            {(entry.photo_url || entry.project_link) && (
              <div className="flex items-start gap-3" style={{ marginTop: RULE }}>
                {entry.photo_url && (
                  <a href={entry.photo_url} target="_blank" rel="noopener noreferrer">
                    {/* Sized to the ruling too, so the text after it lands back
                        on a line. */}
                    <img src={thumbUrl(entry.photo_url)} alt="" loading="lazy" decoding="async"
                         className="rounded border border-gray-200 object-cover"
                         style={{ height: RULE * 5 }}
                         onError={thumbFallback(entry.photo_url, el => { el.style.display = 'none' })} />
                  </a>
                )}
                {entry.project_link && (
                  <a href={entry.project_link} target="_blank" rel="noopener noreferrer"
                     className="text-sm text-brand-blue-dark hover:underline flex items-center gap-1"
                     style={{ lineHeight: `${RULE}px` }}>
                    <ExternalLink size={12} /> link
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Page turn. The forward arrow sits in the bottom right corner, where a
          thumb already is on a real page. */}
      <div className="relative flex items-center justify-between px-4 py-2 border-t border-gray-100">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-0 transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-3">
          {/* Once you're reading, the way back to the contents shouldn't be
              twenty presses of Back. */}
          {!onContents && (
            <button onClick={() => setPage(0)}
              className="text-[11px] text-gray-400 hover:text-gray-700 underline">
              Contents
            </button>
          )}
          <span className="text-[11px] text-gray-400" style={HAND}>
            {onContents
              ? (contentsPages > 1 ? `Contents ${page + 1}/${contentsPages}` : 'Contents')
              : `${page - contentsPages + 1} / ${pages.length}`}
          </span>
        </div>

        <button
          onClick={() => setPage(p => Math.min(lastPage, p + 1))}
          disabled={page === lastPage}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-0 transition-colors"
        >
          {page === contentsPages - 1 ? 'Start reading' : 'Next'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
