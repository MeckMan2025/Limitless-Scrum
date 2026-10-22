import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Read what an emailed auth link brought back before the client consumes the
// URL hash. The client fires PASSWORD_RECOVERY while it starts up, before the
// app has subscribed, so the event alone can't be relied on.
const linkParams = new URLSearchParams(window.location.hash.slice(1))
export const arrivedFromRecoveryLink =
  linkParams.get('type') === 'recovery' && linkParams.has('access_token')
// Set when the link was rejected: expired, or replaced by a newer email.
export const authLinkError = linkParams.get('error_code') === 'otp_expired'
  ? 'That link has expired or was already used. Only the link in the newest email works, so request a fresh one with Forgot password.'
  : linkParams.get('error_description')

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
