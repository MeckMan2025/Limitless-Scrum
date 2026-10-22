// Presence indicator: green when the person is currently online, red when not.
// `online` comes from Supabase Realtime presence (see PresenceContext).
export default function OnlineDot({ online, size = 12, ring = true, className = '' }) {
  return (
    <span
      title={online ? 'Online now' : 'Offline'}
      aria-label={online ? 'Online' : 'Offline'}
      className={`inline-block rounded-full ${ring ? 'ring-2 ring-white' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: online ? '#22c55e' : '#ef4444',
        boxShadow: online ? '0 0 0 3px rgba(34,197,94,0.25)' : 'none',
      }}
    />
  )
}
