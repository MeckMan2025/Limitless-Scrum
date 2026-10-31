import { useState, useEffect, useRef } from 'react'
import { restHeaders } from '../lib/restHeaders'
import { Settings, Bell, Music, Volume2, Lock, Sparkles, RefreshCw, LayoutGrid } from 'lucide-react'
import { supabase } from '../supabase'
import { useUser } from '../contexts/UserContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import PasswordInput from './PasswordInput'
import { ChangelogModal } from './ChangelogPopup'
import ScoutingSync from './ScoutingSync'
import { FEATURES, useFeatures, setFeature } from '../lib/features'
import { usePermissions } from '../hooks/usePermissions'

const MUSIC_OPTIONS = [
  { id: 'random', label: 'Random', description: 'Pick a random song each time' },
  { id: 'intro', label: 'Intro', description: 'Original intro track' },
  { id: 'radical-robotics', label: 'Radical Robotics', description: 'Team anthem' },
  { id: 'radical-theme', label: 'Theme Song', description: 'AI-generated team theme song' },
  { id: 'off', label: 'Off', description: 'No music on startup' },
]

export default function SettingsView() {
  const { user } = useUser()
  const features = useFeatures()
  // The switches are the whole team's, so leads flip them.
  const { hasLeadTag } = usePermissions()
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, permission: pushPermission, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications()
  const [showChangelog, setShowChangelog] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState({ enabled: true, calendar: true, chat: true })
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')
  const notifPrefsLoaded = useRef(false)

  const [musicPref, setMusicPref] = useState(() => localStorage.getItem('scrum-music-pref') || 'off')
  const [sfxEnabled, setSfxEnabled] = useState(() => localStorage.getItem('scrum-sfx-enabled') !== 'false')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwSubmitting, setPwSubmitting] = useState(false)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Music and sound effects follow the person, not the computer: kept on their
  // profile as app_prefs, copied to this device when they sign in (UserContext).
  const saveAppPref = (patch) => {
    if (!user) return
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=app_prefs`, { headers: restHeaders() })
      .then(res => res.ok ? res.json() : [])
      .then(rows => fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { ...restHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ app_prefs: { ...(rows[0]?.app_prefs || {}), ...patch } }),
      }))
      .catch(err => console.error('Failed to save preference:', err))
  }

  // Load notification prefs from profile
  useEffect(() => {
    if (!user) return
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=notification_prefs`, {
      headers: restHeaders(),
    })
      .then(res => res.ok ? res.json() : [])
      .then(rows => {
        if (rows[0]?.notification_prefs) setNotifPrefs(rows[0].notification_prefs)
      })
      .catch(() => {})
  }, [user])

  // Auto-save notification prefs
  useEffect(() => {
    if (!user) return
    if (!notifPrefsLoaded.current) {
      notifPrefsLoaded.current = true
      return
    }
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        ...restHeaders(),
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ notification_prefs: notifPrefs }),
    }).catch(err => console.error('Failed to save notification prefs:', err))
  }, [notifPrefs, user])

  return (
    <div className="max-w-2xl mx-auto p-4 pl-14 md:pl-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
        <Settings size={22} className="text-brand-silver" />
        Settings
      </h2>

      {/* ─── Features ─── */}
      {/* The Scrum boards are the app; everything else is switched on here. */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <LayoutGrid size={16} className="text-brand-blue-ink" />
          Features
        </h3>
        <p className="text-xs text-gray-600 mb-3">
          {hasLeadTag
            ? 'Switch on the parts of the app the team uses. This changes the app for everyone on every computer; anything off disappears from the menu.'
            : 'The parts of the app the team uses. Leads switch these on and off for everyone.'}
        </p>
        <div className="divide-y divide-gray-100">
          {FEATURES.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{f.label}</p>
                <p className="text-xs text-gray-600">{f.desc}</p>
              </div>
              <button
                role="switch"
                aria-checked={!!features[f.key]}
                aria-label={f.label}
                disabled={f.locked || !hasLeadTag}
                onClick={() => setFeature(f.key, !features[f.key])}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                  features[f.key] ? 'bg-brand-blue-dark' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  features[f.key] ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Push Notifications ─── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Bell size={16} className="text-brand-blue-ink" />
          Push Notifications
        </h3>
        {!pushSupported ? (
          <p className="text-sm text-gray-600">Push notifications are not supported in this browser.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Enable push notifications</p>
                <p className="text-xs text-gray-600">
                  {pushPermission === 'denied'
                    ? 'Notifications are blocked in browser settings'
                    : pushSubscribed
                    ? 'Receiving push notifications on this device'
                    : 'Not subscribed on this device'}
                </p>
              </div>
              <button
                onClick={async () => {
                  setPushBusy(true)
                  setPushError('')
                  try {
                    if (pushSubscribed) {
                      const ok = await pushUnsubscribe()
                      if (ok) {
                        setNotifPrefs(prev => ({ ...prev, enabled: false }))
                      } else {
                        setPushError('Failed to unsubscribe')
                      }
                    } else {
                      const ok = await pushSubscribe()
                      if (ok) {
                        setNotifPrefs(prev => ({ ...prev, enabled: true }))
                      } else {
                        setPushError(
                          pushPermission === 'denied'
                            ? 'Blocked in browser settings — check site permissions'
                            : 'Subscribe failed — check browser console for details'
                        )
                      }
                    }
                  } catch (err) {
                    setPushError(err.message)
                  }
                  setPushBusy(false)
                }}
                disabled={pushPermission === 'denied' || pushBusy}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${
                  pushSubscribed && notifPrefs.enabled ? 'bg-brand-blue-dark' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  pushSubscribed && notifPrefs.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {pushBusy && <p className="text-xs text-gray-600">Working...</p>}
            {pushError && <p className="text-xs text-red-600">{pushError}</p>}

            {pushSubscribed && (
              <>
                <div className="flex items-center justify-between pl-4 border-l-2 border-gray-100">
                  <p className="text-sm text-gray-600">Calendar events</p>
                  <button
                    onClick={() => setNotifPrefs(prev => ({ ...prev, calendar: !prev.calendar }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifPrefs.calendar ? 'bg-brand-blue-dark' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      notifPrefs.calendar ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-gray-600 italic">Leads can force-send important notifications even if you turn these off.</p>
              </>
            )}
          </div>
        )}
      </section>

      {/* ─── Daily Pulse — local-only for now, so the switch is hidden on the
           deployed site rather than offering to toggle something that isn't
           there. The stored preference is left alone and works again if the
           feature comes back. ─── */}
      {import.meta.env.DEV && (
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <Bell size={16} className="text-brand-yellow-dark" />
          Daily Team Pulse
        </h3>
        <p className="text-xs text-gray-600 mb-3">A quick 15-second check-in once a day. Your responses are anonymous to leaders.</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Show daily pulse popup</p>
          <button
            onClick={() => setNotifPrefs(prev => ({ ...prev, pulse: prev.pulse === false }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              notifPrefs.pulse !== false ? 'bg-brand-yellow-dark' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              notifPrefs.pulse !== false ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </section>
      )}

      {/* ─── Startup Music ─── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Music size={16} className="text-brand-yellow-dark" />
          Startup Music
        </h3>
        <p className="text-xs text-gray-600 mb-3">Choose which song plays when you open the app.</p>
        <div className="space-y-2">
          {MUSIC_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                setMusicPref(opt.id)
                localStorage.setItem('scrum-music-pref', opt.id)
                saveAppPref({ music: opt.id })
              }}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                musicPref === opt.id
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-200 hover:border-brand-yellow/50'
              }`}
            >
              <p className="text-sm font-medium text-gray-700">{opt.label}</p>
              <p className="text-xs text-gray-600">{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Sound Effects ─── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Volume2 size={16} className="text-brand-blue-ink" />
          Sound Effects
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Enable button sounds</p>
            <p className="text-xs text-gray-600">Play a sound when adding tasks and boards</p>
          </div>
          <button
            onClick={() => {
              const next = !sfxEnabled
              setSfxEnabled(next)
              localStorage.setItem('scrum-sfx-enabled', String(next))
              saveAppPref({ sfx: next })
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              sfxEnabled ? 'bg-brand-blue-dark' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              sfxEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </section>

      {/* ─── Scouting Sync ─── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <RefreshCw size={16} className="text-brand-gold-dark" />
          Scouting Sync
        </h3>
        <p className="text-xs text-gray-600 mb-3">
          No Wi-Fi at the venue? AirDrop sends every match scouted so far as a file.
          On the other device, tap Receive and pick it — matches already there are skipped.
        </p>
        <ScoutingSync />
      </section>

      {/* ─── What's New ─── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-silver-dark" />
          What's New
        </h3>
        <p className="text-sm text-gray-500 mb-3">
          The popup only shows updates since you last dismissed it. Read the full history here.
        </p>
        <button
          onClick={() => setShowChangelog(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-brand-silver/40 hover:bg-brand-silver transition-colors"
        >
          See all updates
        </button>
      </section>

      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}

      {/* ─── Change Password ─── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Lock size={16} className="text-brand-blue-ink" />
          Change Password
        </h3>
        <form onSubmit={async (e) => {
          e.preventDefault()
          setPwError('')
          setPwSuccess(false)
          if (newPassword.length < 6) {
            setPwError('Password must be at least 6 characters')
            return
          }
          if (newPassword !== confirmPassword) {
            setPwError('Passwords do not match')
            return
          }
          setPwSubmitting(true)
          try {
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error
            setPwSuccess(true)
            setNewPassword('')
            setConfirmPassword('')
            setTimeout(() => setPwSuccess(false), 3000)
          } catch (err) {
            setPwError(err.message)
          } finally {
            setPwSubmitting(false)
          }
        }} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">New Password</label>
            <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Enter new password" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Confirm Password</label>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm new password" />
          </div>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-green-700">Password updated successfully!</p>}
          <button
            type="submit"
            disabled={pwSubmitting || !newPassword || !confirmPassword}
            className="px-4 py-2 bg-brand-blue text-brand-black rounded-lg text-sm font-medium hover:bg-brand-blue-dark hover:text-white transition-colors disabled:opacity-40"
          >
            {pwSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>
    </div>
  )
}
