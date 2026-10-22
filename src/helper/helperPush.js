import { restHeaders } from '../lib/restHeaders'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Must match the server's VAPID key. Hardcoded on purpose, like
// src/hooks/usePushNotifications.js (see NOTIFICATIONS.md before changing it).
const VAPID_PUBLIC_KEY = 'BBLs33t6ED59L7rMEJqQ_NgAkEBmo6V8n7K7PPguDD4WvVSI1Zj2HFhLgK1mybMHzZtB6gkaSRGaergqRX-r0Zw'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// EN Helper's own worker, scoped to /helper/, so its subscription is its own
// and the main app's notifications never arrive on this icon.
export function registerHelperWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  return navigator.serviceWorker.register('/helper/sw.js', { scope: '/helper/' }).catch((err) => {
    console.warn('[EN Helper] service worker registration failed:', err)
    return null
  })
}

function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function saveSubscription(userId, sub) {
  const j = sub.toJSON()
  const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?on_conflict=user_id,endpoint`, {
    method: 'POST',
    headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, app: 'helper' }),
  })
  if (!res.ok) throw new Error(`subscription save ${res.status}`)
}

// The /helper/ worker once it is active (subscribing needs an active one).
// Gives up after a few seconds rather than hang a button on a stuck worker.
async function helperRegistration() {
  // getRegistration matches by URL, so with only the main app's worker it
  // would hand back that one. Check the scope is really ours.
  const existing = await navigator.serviceWorker.getRegistration('/helper/')
  if (!existing?.scope.endsWith('/helper/')) await registerHelperWorker()
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise(resolve => setTimeout(() => resolve(null), 5000)),
  ])
}

// Is this device already getting EN Helper reminders?
export async function remindersOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await helperRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

// Keep the stored subscription current on every open (phones quietly replace
// them). Never asks for permission: that only happens on a tap.
export async function syncReminders(userId) {
  try {
    if (!pushSupported() || Notification.permission !== 'granted' || !userId) return
    const reg = await helperRegistration()
    if (!reg) return
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
    await saveSubscription(userId, sub)
  } catch (err) {
    console.warn('[EN Helper] reminder sync failed:', err)
  }
}

// The one tap. Resolves true when reminders are on.
export async function turnOnReminders(userId) {
  if (!pushSupported()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const reg = await helperRegistration()
  if (!reg) return false
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  await saveSubscription(userId, sub)
  return true
}
