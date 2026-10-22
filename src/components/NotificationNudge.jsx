import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X, Share, Plus, Check } from 'lucide-react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { isNative } from '../utils/platform'

// Asks people to switch notifications on, once, with the reasons why. Only two
// accounts had them enabled, so the app was quietly unable to reach anyone.
// Everything listed below is something the app genuinely sends — see
// triggerPush callers.

const REASONS = [
  ['📋', 'A task gets assigned to you'],
  ['📣', 'A lead posts an announcement or a poll'],
  ['🏷️', 'Your role changes'],
  ['✅', 'Something you asked for is approved or denied'],
  ['🕓', 'A meeting or event is coming up'],
]

// Bump this version to re-show the nudge to everyone once more (their old
// dismissal no longer matches, so it reappears on next login and disappears
// again once they act). Only shows to people who haven't enabled notifications.
const DISMISS_KEY = 'scrum-notif-nudge-dismissed-v2'

// Installed to the home screen? Notifications are impossible on iOS until then.
const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)')?.matches ||
  window.navigator.standalone === true

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)

export default function NotificationNudge() {
  const { isSupported, isSubscribed, permission, subscribe } = usePushNotifications()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  // Preview override: add ?nudge to the URL to force the guide open once,
  // regardless of subscription/dismissal (for screenshots). Affects no one else.
  const forcePreview = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('nudge')

  useEffect(() => {
    if (forcePreview) { setOpen(true); return }            // preview: show immediately
    if (isNative) return                                   // handled by APNs
    if (localStorage.getItem(DISMISS_KEY)) return
    if (isSubscribed) return
    // Blocked can't be undone from here — nagging would just annoy.
    if (permission === 'denied') return
    // Give the app a moment to settle rather than interrupting the load.
    const t = setTimeout(() => setOpen(true), 2500)
    return () => clearTimeout(t)
  }, [isSubscribed, permission, forcePreview])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setOpen(false)
  }

  const turnOn = async () => {
    setBusy(true); setFailed('')
    try {
      const ok = await subscribe()
      if (ok) { localStorage.setItem(DISMISS_KEY, '1'); setOpen(false) }
      else setFailed('That didn\'t go through. If you tapped "Don\'t Allow", you\'ll need to fix it in your phone settings.')
    } catch {
      setFailed('Something went wrong turning them on.')
    } finally {
      setBusy(false) }
  }

  if (!open) return null

  // On an iPhone, Safari refuses notifications until the site is installed to
  // the home screen — so show how to do that instead of a button that can't work.
  const needsInstall = isIOS() && !isInstalled()
  const cantAskYet = needsInstall || !isSupported

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[150]" onClick={dismiss} />
      <div className="fixed inset-0 z-[151] flex items-end sm:items-center justify-center p-3 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden">
          <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-brand-blue/40 via-brand-yellow/40 to-brand-silver/40">
            <div className="flex items-start gap-2">
              <Bell size={18} className="text-brand-yellow-dark mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-700 leading-tight">Turn on notifications</h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  So you don't miss things meant for you.
                </p>
              </div>
              <button onClick={dismiss} className="p-1 rounded hover:bg-black/10">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-2">
              You'll get a ping when
            </p>
            <ul className="space-y-1.5">
              {REASONS.map(([emoji, text]) => (
                <li key={text} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="shrink-0">{emoji}</span>
                  <span className="leading-snug">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {needsInstall ? (
            <div className="px-4 pb-3">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  On iPhone, add ETS to your home screen first — Safari won't allow
                  notifications until you do.
                </p>
                <ol className="space-y-1.5 text-xs text-gray-600">
                  <li className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-400">1.</span>
                    <Share size={12} className="text-brand-blue-dark" /> Tap Share, at the bottom of Safari
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-400">2.</span>
                    <Plus size={12} className="text-brand-blue-dark" /> Tap "Add to Home Screen"
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="font-bold text-gray-400">3.</span>
                    <span>Open ETS from the new icon, then come back to this box and tap Allow</span>
                  </li>
                </ol>
              </div>
              <button
                onClick={dismiss}
                className="w-full mt-2.5 py-2 rounded-xl text-sm font-semibold bg-brand-yellow hover:bg-brand-yellow-dark text-gray-800"
              >
                Got it
              </button>
            </div>
          ) : (
            <div className="px-4 pb-4">
              {failed && <p className="text-xs text-red-500 mb-2">{failed}</p>}
              <button
                onClick={turnOn}
                disabled={busy || cantAskYet}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 text-gray-800 inline-flex items-center justify-center gap-1.5"
              >
                <Check size={15} /> {busy ? 'Turning on…' : 'Turn on notifications'}
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-1.5">
                Your phone will ask — tap <span className="font-semibold">Allow</span>. Tapping “Don't
                Allow” can't be undone from here.
              </p>
              <button onClick={dismiss} className="w-full mt-1.5 py-1.5 text-xs text-gray-400 hover:text-gray-600">
                Not now
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
