import { useEffect } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useUser } from '../contexts/UserContext'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Registers the device for APNs push and saves the token to apns_tokens.
// Only runs on native iOS. On web, it's a no-op.
export function useNativePush() {
  const { user } = useUser()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (!user) return

    let cancelled = false

    async function register() {
      try {
        let perm = await PushNotifications.checkPermissions()
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          perm = await PushNotifications.requestPermissions()
        }
        if (perm.receive !== 'granted') {
          console.log('[NativePush] permission not granted:', perm.receive)
          return
        }
        await PushNotifications.register()
      } catch (err) {
        console.error('[NativePush] register failed:', err)
      }
    }

    const onRegister = async ({ value }) => {
      if (cancelled || !value) return
      console.log('[NativePush] APNs token received')
      try {
        const row = {
          id: 'apns_' + user.id.slice(0, 8) + '_' + value.slice(0, 8),
          user_id: user.id,
          token: value,
          bundle_id: 'org.radicalrobotics.scrum',
          device_info: navigator.userAgent || '',
        }
        await fetch(`${supabaseUrl}/rest/v1/apns_tokens?on_conflict=user_id,token`, {
          method: 'POST',
          headers: {
            ...restHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(row),
        })
      } catch (err) {
        console.error('[NativePush] saving token failed:', err)
      }
    }

    const onError = (err) => console.error('[NativePush] registration error:', err)

    // Listeners
    let registrationHandle, errorHandle, receivedHandle, actionHandle
    Promise.all([
      PushNotifications.addListener('registration', onRegister),
      PushNotifications.addListener('registrationError', onError),
      PushNotifications.addListener('pushNotificationReceived', (n) => {
        console.log('[NativePush] received in-app:', n)
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        console.log('[NativePush] tapped:', a)
      }),
    ]).then(([r, e, rec, act]) => {
      if (cancelled) {
        r?.remove?.(); e?.remove?.(); rec?.remove?.(); act?.remove?.()
      } else {
        registrationHandle = r; errorHandle = e; receivedHandle = rec; actionHandle = act
      }
    })

    register()

    return () => {
      cancelled = true
      registrationHandle?.remove?.()
      errorHandle?.remove?.()
      receivedHandle?.remove?.()
      actionHandle?.remove?.()
    }
  }, [user])
}
