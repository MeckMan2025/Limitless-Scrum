import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Download, Loader2, Image as ImageIcon } from 'lucide-react'
import { thumbUrl, thumbFallback } from '../lib/photos'

// Every photo in the notebook, on one screen, and a way to get them off it.
//
// The notebook is the season's evidence: judges ask for photos, the website
// wants them, and awards submissions want them a week before anyone remembers
// which meeting the good one was from. Until now the only way to get a photo
// back out was to open the entry that holds it and long-press, one at a time.
//
// The entries are passed in rather than fetched. EngineeringNotebook has
// already loaded them and merged each photo in, so refetching here would pull
// the same megabytes of image data down twice. Passing `filteredEntries` also
// means the notebook's own filter bar — season, person, topic, category —
// filters the gallery, and "Save all" saves exactly what is on screen. That is
// how you export one project's photos, or one person's, without this screen
// growing a second set of filters that could disagree with the first.

// What a saved file is called. The date and who wrote it first, because that
// is how a folder of these is read later; the entry's own words after, cut
// short, since filenames that long get truncated by whatever opens them.
function fileNameFor(entry, url) {
  const date = (entry.meeting_date || entry.created_at || '').slice(0, 10) || 'undated'
  const who = (entry.username || 'team').replace(/[^\w]+/g, '-')
  const what = (entry.what_did || 'entry')
    .replace(/[^\w\s]+/g, '').trim().split(/\s+/).slice(0, 6).join('-')
  const ext = /\.png($|\?)/i.test(url) || url.startsWith('data:image/png') ? 'png' : 'jpg'
  return `EN-${date}-${who}${what ? '-' + what : ''}.${ext}`.slice(0, 120)
}

// The photo as bytes. Inline data: URIs and stored ones both come back the
// same way; fetch() reads a data: URI without touching the network.
async function blobFor(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  return res.blob()
}

async function fileFor(entry, url) {
  const blob = await blobFor(url)
  return new File([blob], fileNameFor(entry, url), { type: blob.type || 'image/jpeg' })
}

// Getting a photo out, by whatever route this device has.
//
// On a phone the share sheet is the only route into the camera roll: an
// <a download> on iOS saves into Files, not Photos, which is not where anyone
// looks for it. So share first when the browser will take files — that sheet
// has "Save Image" on it — and fall back to a download on a desktop, where a
// file in Downloads is exactly what was wanted.
//
// Returns 'shared', 'downloaded' or 'cancelled'. Cancelling the share sheet
// throws AbortError, which is a person changing their mind, not a failure.
async function savePhotos(files) {
  if (files.length === 0) return 'cancelled'
  if (navigator.canShare?.({ files }) && navigator.share) {
    try {
      await navigator.share({ files })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // Share refused these files (too many, or too big). Fall through and
      // download instead rather than telling the user it can't be done.
    }
  }
  for (const file of files) {
    const href = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = href
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked late: Safari cancels a download whose blob URL has already gone.
    setTimeout(() => URL.revokeObjectURL(href), 10000)
    if (files.length > 1) await new Promise(r => setTimeout(r, 150))
  }
  return 'downloaded'
}

// One share sheet, not twenty. A second share() without a fresh tap is
// refused by the browser, so saving a lot of photos to a phone has to go in
// one call; twenty full-size photos is about as much as the sheet will take.
const SHARE_BATCH = 20

export default function NotebookPhotos({ entries, projects = [], onBack, onOpenEntry }) {
  const [index, setIndex] = useState(null)   // open photo, or null
  const [busy, setBusy] = useState('')       // '' | 'one' | 'all'
  const [note, setNote] = useState('')       // what just happened, or went wrong

  const projectName = useCallback(
    (id) => projects.find(p => p.id === id)?.name || '',
    [projects],
  )

  // Newest first, which is the order people look for a photo in.
  const photos = useMemo(() => (entries || [])
    .filter(e => e.photo_url && (e.photo_url.startsWith('data:') || e.photo_url.startsWith('http')))
    .sort((a, b) => String(b.meeting_date || b.created_at || '')
      .localeCompare(String(a.meeting_date || a.created_at || ''))), [entries])

  const open = index != null ? photos[index] : null

  // Arrow keys and Escape, because this is a photo viewer and that is what
  // they do everywhere else.
  useEffect(() => {
    if (index == null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setIndex(null)
      else if (e.key === 'ArrowRight') setIndex(i => Math.min(photos.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length])

  useEffect(() => { if (note) { const t = setTimeout(() => setNote(''), 4000); return () => clearTimeout(t) } }, [note])

  const saveOne = async (entry) => {
    if (busy) return
    setBusy('one'); setNote('')
    try {
      const result = await savePhotos([await fileFor(entry, entry.photo_url)])
      if (result === 'downloaded') setNote('Saved to your downloads.')
      else if (result === 'shared') setNote('Saved.')
    } catch (err) {
      console.error('Could not save photo:', err)
      setNote("Couldn't save that one. Open it and save it by hand.")
    } finally { setBusy('') }
  }

  const saveAll = async () => {
    if (busy || photos.length === 0) return
    setBusy('all'); setNote('')
    try {
      const batch = photos.slice(0, SHARE_BATCH)
      const files = []
      for (const entry of batch) {
        try { files.push(await fileFor(entry, entry.photo_url)) }
        catch (err) { console.error('Skipped a photo:', err) }
      }
      if (files.length === 0) { setNote("Couldn't read any of these photos."); return }
      const result = await savePhotos(files)
      if (result === 'cancelled') return
      const where = result === 'shared' ? 'Saved' : 'Saved to your downloads'
      setNote(photos.length > batch.length
        ? `${where}: ${files.length} of ${photos.length}. Narrow the filters to get the rest.`
        : `${where}: ${files.length} photo${files.length === 1 ? '' : 's'}.`)
    } finally { setBusy('') }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to projects
        </button>
        <span className="text-xs text-gray-400">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
          {photos.length > 0 && ' · tap one to open it'}
        </span>
      </div>

      {photos.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={saveAll}
            disabled={!!busy}
            className="h-9 px-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-blue hover:bg-brand-blue-dark disabled:opacity-60 transition-colors text-sm font-semibold text-gray-800"
          >
            {busy === 'all' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {busy === 'all' ? 'Saving…' : `Save all (${Math.min(photos.length, SHARE_BATCH)})`}
          </button>
          <span className="text-[11px] text-gray-400">
            These are the photos your filters are showing — filter first to save a project's or a person's.
          </span>
        </div>
      )}

      {note && <p className="text-xs text-gray-500">{note}</p>}

      {photos.length === 0 ? (
        <div className="text-center py-12">
          <ImageIcon size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No photos in what's showing.</p>
          <p className="text-xs text-gray-400 mt-1">
            Entries with a photo appear here. Clear the filters above to see the whole notebook.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
          {photos.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setIndex(i)}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
              title={e.what_did || 'Entry photo'}
            >
              <img
                src={thumbUrl(e.photo_url)}
                alt={e.what_did || 'Entry photo'}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                onError={thumbFallback(e.photo_url, el => { el.style.visibility = 'hidden' })}
              />
              <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[9px] leading-tight text-white bg-black/45 truncate">
                {(e.meeting_date || e.created_at || '').slice(5, 10)} · {e.username}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && createPortal(
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col"
          onClick={() => setIndex(null)}
        >
          <div className="flex items-center justify-between gap-2 p-3 text-white shrink-0">
            <span className="text-xs text-white/70">{index + 1} of {photos.length}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={(ev) => { ev.stopPropagation(); saveOne(open) }}
                disabled={!!busy}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-60 text-sm font-medium"
              >
                {busy === 'one' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Save photo
              </button>
              <button
                onClick={(ev) => { ev.stopPropagation(); setIndex(null) }}
                aria-label="Close"
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-0 px-2">
            {index > 0 && (
              <button
                onClick={(ev) => { ev.stopPropagation(); setIndex(i => i - 1) }}
                aria-label="Previous photo"
                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <img
              src={open.photo_url}
              alt={open.what_did || 'Entry photo'}
              onClick={(ev) => ev.stopPropagation()}
              className="max-h-full max-w-full object-contain mx-auto"
            />
            {index < photos.length - 1 && (
              <button
                onClick={(ev) => { ev.stopPropagation(); setIndex(i => i + 1) }}
                aria-label="Next photo"
                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {/* The caption is the point of keeping these with the notebook: a
              photo on its own is a robot, a photo with its entry is evidence. */}
          <div
            className="shrink-0 p-3 text-white/90 text-center"
            onClick={(ev) => ev.stopPropagation()}
          >
            <p className="text-sm font-medium line-clamp-2">{open.what_did || 'Entry photo'}</p>
            <p className="text-[11px] text-white/60 mt-0.5">
              {open.username}
              {open.meeting_date && ` · ${open.meeting_date}`}
              {projectName(open.project_id) && ` · ${projectName(open.project_id)}`}
            </p>
            {note && <p className="text-[11px] text-white/80 mt-1">{note}</p>}
            {onOpenEntry && (
              <button
                onClick={() => { setIndex(null); onOpenEntry(open) }}
                className="mt-2 text-[11px] underline text-white/70 hover:text-white"
              >
                Open this entry
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
