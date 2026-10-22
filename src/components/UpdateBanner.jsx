import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// "I still see the old screen."
//
// index.html is served with max-age=600, so for ten minutes after a deploy a
// browser that has the page keeps using its copy — and that copy names the old
// JavaScript bundle by its hashed filename, so every screen in the app stays
// the old one. Nothing is broken and no amount of waiting on the page helps:
// it is a cached file, and only a reload that bypasses the cache replaces it.
// A hard refresh fixes it, which is a thing people have to be told, remember,
// and do on a phone where it is awkward.
//
// So the app checks for itself. Every few minutes, and whenever the tab comes
// back to the front, it fetches index.html with caching turned off and reads
// which bundle it names. If that is not the bundle running, a new version is
// out and this says so, with the button that takes it.
//
// It never reloads on its own. Somebody halfway through writing a notebook
// entry or scouting a match would lose it, and a surprise reload is worse than
// a stale tab.

const CHECK_EVERY_MS = 5 * 60 * 1000

// The bundle this page is running, read off the script tag that loaded it.
// Only ever present in a built app: in dev there are no hashed assets, which
// is also why the check does not run there.
function runningBundle() {
  const el = document.querySelector('script[type="module"][src*="/assets/"]')
  return el?.getAttribute('src') || null
}

// The bundle the server is handing out now. Null when offline or when
// anything about the response is not what we expect — a failed check must
// never produce a banner.
async function servedBundle() {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1] || null
  } catch {
    return null
  }
}

export default function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const mine = runningBundle()
    if (!mine) return   // dev server, or a build without hashed assets

    let cancelled = false
    const check = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      const theirs = await servedBundle()
      if (!cancelled && theirs && theirs !== mine) setStale(true)
    }

    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!stale) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw]">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-900/95 text-white shadow-xl">
        <RefreshCw size={15} className="shrink-0" />
        <span className="text-sm">A newer version of the app is ready.</span>
        <button
          type="button"
          // location.reload() can be answered from the browser's own cache,
          // which is the thing that is stale. A fresh URL cannot be.
          onClick={() => { window.location.href = `${window.location.pathname}?r=${Date.now()}${window.location.hash}` }}
          className="shrink-0 px-3 py-1 rounded-lg bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setStale(false)}
          aria-label="Not now"
          className="shrink-0 text-white/50 hover:text-white text-sm"
        >
          Later
        </button>
      </div>
    </div>
  )
}
