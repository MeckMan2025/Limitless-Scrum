import { restHeaders } from '../lib/restHeaders'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function triggerPush(notificationRecord) {
  if (!supabaseUrl) return

  fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...restHeaders(),
    },
    body: JSON.stringify({ record: notificationRecord }),
  }).catch((err) => {
    console.warn('Push notification failed:', err)
  })
}
