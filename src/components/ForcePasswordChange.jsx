import { useState } from 'react'
import { useUser } from '../contexts/UserContext'
import PasswordInput from './PasswordInput'

// The temporary-password screen. A lead sets a temporary password for a
// student who can't receive email, and this is where the student picks their
// own. Lives on its own so the EN Helper can show it too without loading the
// whole app.
export default function ForcePasswordChange({ updatePassword }) {
  const { logout } = useUser()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (pw.length < 6) { setError('Password must be at least 6 characters'); return }
    if (pw !== confirm) { setError('Passwords do not match'); return }
    setSubmitting(true)
    try {
      await updatePassword(pw)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A] flex items-center justify-center">
      <form onSubmit={handleSubmit} className="relative bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-8 w-80 space-y-5">
        <button
          type="button"
          onClick={() => logout()}
          title="Cancel and sign out"
          aria-label="Cancel and sign out"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-lg leading-none"
        >
          ✕
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-700">Choose a new password</h2>
          <p className="text-sm text-gray-500 mt-1">
            You're signing in with a temporary password. Pick your own before you continue.
          </p>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
            Set Your Password
          </h1>
          <p className="text-sm text-gray-500 mt-1">You must set a new password before continuing</p>
        </div>
        <PasswordInput
          value={pw}
          onChange={(e) => { setPw(e.target.value); setError('') }}
          placeholder="New password"
          className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-brand-blue focus:border-transparent text-center text-lg"
          autoFocus
          required
        />
        <PasswordInput
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError('') }}
          placeholder="Confirm password"
          className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-brand-blue focus:border-transparent text-center text-lg"
          required
        />
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-xl font-semibold text-gray-700 transition-colors text-lg"
        >
          {submitting ? 'Setting password...' : 'Set Password'}
        </button>
      </form>
    </div>
  )
}
