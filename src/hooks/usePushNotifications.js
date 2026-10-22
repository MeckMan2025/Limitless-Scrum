import { useState, useEffect, useCallback } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'

// Raw REST upsert/delete — supabase JS client hangs silently in some cases.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

async function restUpsertSubscription(row) {
  const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?on_conflict=user_id,endpoint`, {
    method: 'POST',
    headers: {
      ...restHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error('upsert failed: ' + res.status + ' ' + body)
  }
}

async function restDeleteSubscription(userId, endpoint) {
  const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'DELETE',
    headers: restHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error('delete failed: ' + res.status + ' ' + body)
  }
}

function urlBase64ToUint8Array(base64String) {
  const cleaned = base64String.trim().replace(/\s/g, '')
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4)
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications() {
  const { user } = useUser()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permission, setPermission] = useState('default')

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  // Check current state on mount and sync browser subscription to DB.
  // Self-heal: if iOS evicted the subscription but permission is still granted,
  // silently re-subscribe so we don't go quiet over time.
  useEffect(() => {
    if (!isSupported) return
    setPermission(Notification.permission)

    const VAPID_PUBLIC_KEY = 'BBLs33t6ED59L7rMEJqQ_NgAkEBmo6V8n7K7PPguDD4WvVSI1Zj2HFhLgK1mybMHzZtB6gkaSRGaergqRX-r0Zw'

    // Convert a subscription's applicationServerKey (ArrayBuffer) to base64url
    // so we can compare it against the current VAPID public key string.
    const subKeyToBase64Url = (sub) => {
      try {
        const buf = sub.options?.applicationServerKey
        if (!buf) return null
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      } catch { return null }
    }

    navigator.serviceWorker.ready.then(async (reg) => {
      let sub = await reg.pushManager.getSubscription()

      // If the existing subscription was made with a stale VAPID key, nuke it
      // so we can re-subscribe with the current one.
      if (sub) {
        const subKey = subKeyToBase64Url(sub)
        if (subKey && subKey !== VAPID_PUBLIC_KEY) {
          console.warn('[Push] VAPID key mismatch — unsubscribing and re-subscribing')
          const oldEndpoint = sub.endpoint
          try { await sub.unsubscribe() } catch {}
          if (user) {
            await restDeleteSubscription(user.id, oldEndpoint).catch(() => {})
          }
          sub = null
        }
      }

      if (!sub && Notification.permission === 'granted' && user) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
          console.log('[Push] auto-resubscribed')
        } catch (err) {
          console.warn('[Push] auto-resubscribe failed:', err)
        }
      }

      setIsSubscribed(!!sub)

      if (sub && user) {
        const subJson = sub.toJSON()
        restUpsertSubscription({
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        }).catch((err) => console.warn('Failed to sync push subscription to DB:', err))
      }
    })
  }, [isSupported, user])

  const subscribe = useCallback(async () => {
    console.log('[Push] subscribe called, isSupported:', isSupported, 'user:', !!user)
    if (!isSupported) { console.warn('[Push] Not supported'); return false }
    if (!user) { console.warn('[Push] No user'); return false }

    try {
      const perm = await Notification.requestPermission()
      console.log('[Push] Permission result:', perm)
      setPermission(perm)
      if (perm !== 'granted') return false

      const reg = await navigator.serviceWorker.ready
      console.log('[Push] Service worker ready')
      const vapidPublicKey = 'BBLs33t6ED59L7rMEJqQ_NgAkEBmo6V8n7K7PPguDD4WvVSI1Zj2HFhLgK1mybMHzZtB6gkaSRGaergqRX-r0Zw'

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      console.log('[Push] Browser subscription created')

      const subJson = sub.toJSON()
      try {
        await restUpsertSubscription({
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        })
      } catch (err) {
        console.error('[Push] DB save failed:', err)
        return false
      }

      console.log('[Push] Subscription saved to DB')
      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('[Push] Subscribe error:', err)
      return false
    }
  }, [isSupported, user])

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !user) return false

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await restDeleteSubscription(user.id, endpoint).catch((err) => console.warn('DB delete failed:', err))
      }
      setIsSubscribed(false)
      return true
    } catch (err) {
      console.error('Push unsubscribe failed:', err)
      return false
    }
  }, [isSupported, user])

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe }
}
