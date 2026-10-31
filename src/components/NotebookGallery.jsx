import { useState, useEffect } from 'react'
import { lazyRestHeaders } from '../lib/restHeaders'
import { createPortal } from 'react-dom'
import { BookOpen, ArrowRight, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { thumbUrl, thumbFallback } from '../lib/photos'
import { usePermissions } from '../hooks/usePermissions'
import { teamScope } from '../lib/teamScope'


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const HEADERS = lazyRestHeaders

export default function NotebookGallery({ onTabChange }) {
  // One rule for whose rows these are — see lib/teamScope.js.
  const { myTeamNumber } = usePermissions()
  const SCOPE = teamScope(myTeamNumber)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(null) // lightbox index

  useEffect(() => {
    let active = true
    async function load() {
      try {
        // Two trips on purpose. Photos are stored inline as data URIs, so
        // pulling every entry's photo just to show fifteen would drag megabytes
        // onto the home screen. Ask which entries have one first — ids only —
        // then fetch the photos for the fifteen actually being shown.
        const hasPhoto = 'or=(photo_url.like.data:*,photo_url.like.http*)'
        const idRes = await fetch(
          `${SUPABASE_URL}/rest/v1/notebook_entries?${SCOPE}&select=id&${hasPhoto}`,
          { headers: HEADERS }
        )
        if (!active) return
        if (!idRes.ok) { setLoading(false); return }
        const ids = (await idRes.json()).map(r => r.id)
        if (ids.length === 0) { setLoading(false); return }

        // A different mix every visit, drawn from the whole notebook rather
        // than whichever entries happen to be newest.
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        const pick = ids.slice(0, 15)
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/notebook_entries?${SCOPE}&select=id,username,meeting_date,what_did,photo_url&id=in.(${pick.join(',')})`,
          { headers: HEADERS }
        )
        if (!active) return
        if (!res.ok) { setLoading(false); return }
        const rows = await res.json()
        // in.() comes back in table order, so shuffle again to keep it a mix.
        const byId = Object.fromEntries((Array.isArray(rows) ? rows : []).map(r => [r.id, r]))
        setPhotos(pick.map(id => byId[id]).filter(Boolean))
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [])

  const selected = index !== null ? photos[index] : null

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-brand-silver-dark" />
          <h2 className="font-semibold text-gray-700">Engineering Notebook</h2>
        </div>
        {/* The only way into the notebook now that it isn't a nav tab, so it
            reads as a real button rather than a quiet link. */}
        <button
          onClick={() => onTabChange && onTabChange('notebook')}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-silver-dark hover:brightness-95 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-all"
        >
          <BookOpen size={15} /> Open Notebook <ArrowRight size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-40 h-32 rounded-lg bg-gray-100 animate-pulse shrink-0" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex items-center justify-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-gray-600 text-sm">No notebook photos yet</p>
        </div>
      ) : (
        <div
          className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setIndex(i)}
              className="relative flex-shrink-0 w-40 h-32 rounded-lg overflow-hidden snap-center group"
            >
              <img
                src={thumbUrl(p.photo_url)}
                alt={p.what_did || 'Notebook photo'}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                onError={thumbFallback(p.photo_url, el => { el.parentElement.style.display = 'none' })}
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                <p className="text-[11px] text-white font-medium truncate">{p.username}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox (portaled to body so it covers the whole screen) */}
      {selected && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setIndex(null)}
        >
          {/* Close (X) — top right of the screen */}
          <button
            onClick={() => setIndex(null)}
            aria-label="Close"
            className="absolute top-4 right-4 z-20 p-2.5 bg-white/15 hover:bg-white/30 rounded-full text-white transition-colors"
          >
            <X size={24} />
          </button>

          <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setIndex((index - 1 + photos.length) % photos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full"
                >
                  <ChevronLeft size={24} className="text-white" />
                </button>
                <button
                  onClick={() => setIndex((index + 1) % photos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full"
                >
                  <ChevronRight size={24} className="text-white" />
                </button>
              </>
            )}
            <img
              src={selected.photo_url}
              alt={selected.what_did || 'Notebook photo'}
              className="w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-2">
              <p className="text-sm text-white font-medium drop-shadow">{selected.username}{selected.meeting_date ? ` · ${selected.meeting_date}` : ''}</p>
              {selected.what_did && <p className="text-xs text-white/80 line-clamp-2 drop-shadow">{selected.what_did}</p>}
              {photos.length > 1 && <p className="text-[11px] text-white/60 mt-0.5">{index + 1} / {photos.length}</p>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
