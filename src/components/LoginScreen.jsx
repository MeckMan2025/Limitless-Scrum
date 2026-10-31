import { useState } from 'react'
import { useUser } from '../contexts/UserContext'
import PasswordInput from './PasswordInput'
import { HOME_TEAM_NUMBER, isHomeTeamNumber, teamAuthEmail, legacyTeamEmails } from '../data/team'
import { supabase } from '../supabase'
import { restHeaders } from '../lib/restHeaders'

function LoginScreen({ sessionExpired, linkError, onBack }) {
  const { login, signup, checkWhitelist, resetPassword, updatePassword, passwordRecovery } = useUser()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Visiting teams sign in by number; the password box below is shared.
  const [teamNumber, setTeamNumber] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signupStep, setSignupStep] = useState(1)
  const [whitelistRole, setWhitelistRole] = useState(null)
  const [rejected, setRejected] = useState(false)
  const [forgotPassword, setForgotPassword] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const resetSignupState = () => {
    setSignupStep(1)
    setRejected(false)
    setWhitelistRole(null)
    setError('')
    setPassword('')
    setDisplayName('')
  }

  const handleCheckEmail = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = await checkWhitelist(email)
      if (result) {
        setWhitelistRole(result.role)
        setSignupStep(2)
        setRejected(false)
      } else {
        setRejected(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (mode === 'signup') {
        if (!displayName.trim()) {
          setError('Display name is required')
          setSubmitting(false)
          return
        }
        await signup(email, password, displayName.trim(), whitelistRole)
      } else {
        const n = teamNumber.trim()
        const mail = email.trim().toLowerCase()

        // Which team they said they were signing in for.
        localStorage.setItem('scrum-signin-team', n)

        let signedIn = null
        if (isHomeTeamNumber(n)) {
          // Ours sign in with their own address, plainly.
          signedIn = await login(mail, password)
        } else {
          // Two kinds of login share this box. A visiting team's shared
          // account carries the team in its address, so one coach can run
          // several — those shapes are tried first, oldest last, so teams
          // added before this keep working. A person who is simply ON another
          // team signs in with their own address, so that is tried too;
          // without it they could not reach their own team at all.
          const candidates = [teamAuthEmail(mail, n), ...legacyTeamEmails(mail, n), mail]
          let lastErr = null
          for (const candidate of candidates) {
            try {
              signedIn = await login(candidate, password)
              lastErr = null
              break
            } catch (err) {
              lastErr = err
              // Anything other than a bad match is a real failure — stop.
              if (!err.message?.includes('Invalid login')) break
            }
          }
          if (lastErr) throw lastErr
        }

        // You may only enter the team you are in.
        //
        // Authenticating proves who you are, not which team you belong to.
        // Those were the same thing while everyone was on one team; now a
        // person taken off a roster must not be able to type the old number
        // and carry on, which is the whole point of taking them off. So the
        // number typed has to match the team their profile says they are on,
        // and a mismatch ends the session rather than quietly putting them
        // somewhere.
        //
        // Team accounts are exempt: their address already names their team, so
        // they cannot be anywhere else.
        const userId = signedIn?.user?.id
        const usedTeamAddress = !isHomeTeamNumber(n) && signedIn?.user?.email !== mail
        if (userId && !usedTeamAddress) {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?select=team_number,extra_teams&id=eq.${userId}&limit=1`,
            { headers: restHeaders() }
          )
          const rows = res.ok ? await res.json() : null
          const theirTeam = String(rows?.[0]?.team_number || HOME_TEAM_NUMBER)
          // Mentors and coaches help more than one team, and should not need a
          // second account to do it. extra_teams lists the other teams this
          // person may enter; typing one of those numbers is allowed and puts
          // them on that team for the session. Nobody else has any, so the
          // one-person-one-team rule is unchanged for students.
          const alsoAllowed = (rows?.[0]?.extra_teams || []).map(String)
          if (rows && theirTeam !== n && !alsoAllowed.includes(n)) {
            await supabase.auth.signOut()
            localStorage.removeItem('scrum-signin-team')
            setError(
              `That account isn't on team ${n}. Sign in with team ${theirTeam}, ` +
              `or ask a lead to add you to ${n}.`
            )
            setSubmitting(false)
            return
          }
        }
      }
    } catch (err) {
      // A team got here by number, so "invalid email or password" would be
      // telling them about a field they never filled in.
      const isTeam = /^\d+$/.test((email || '').trim())
      if (err.message?.includes('Invalid login')) {
        setError(isTeam ? 'Invalid team number or password' : 'Invalid email or password')
      } else {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const wrapper = 'min-h-screen bg-gradient-to-br from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A] flex items-center justify-center'
  const card = 'bg-white rounded-2xl shadow-xl p-8 w-80 space-y-5'
  const input = 'w-full px-4 py-3 border border-gray-400 rounded-xl focus:ring-2 focus:ring-brand-blue-ink focus:border-transparent text-center text-lg'
  const btn = 'w-full py-3 bg-brand-yellow hover:bg-brand-yellow-dark disabled:opacity-50 rounded-xl font-semibold text-brand-black transition-colors text-lg'
  const heading = 'text-2xl font-bold bg-gradient-to-r from-brand-blue-ink to-brand-gold-ink bg-clip-text text-transparent'

  // Password recovery — user clicked reset link in email
  if (passwordRecovery) {
    return (
      <div className={wrapper}>
        <form onSubmit={async (e) => {
          e.preventDefault()
          setError('')
          if (password.length < 6) {
            setError('Password must be at least 6 characters')
            return
          }
          setSubmitting(true)
          try {
            await updatePassword(password)
          } catch (err) {
            setError(err.message)
          } finally {
            setSubmitting(false)
          }
        }} className={card}>
          <div className="text-center">
            <h1 className={heading}>Set New Password</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your new password below</p>
          </div>

          <PasswordInput
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="New password"
            className={input}
            autoFocus
            required
          />

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button type="submit" disabled={submitting} className={btn}>
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    )
  }

  // Rejection screen
  if (mode === 'signup' && rejected) {
    return (
      <div className={wrapper}>
        <div className={`${card} text-center`}>
          <h1 className={heading}>Not on the Whitelist</h1>
          <p className="text-sm text-gray-600">
            Sorry, your email is not on the whitelist. This app is for robotics team members, mentors, and coaches only.
          </p>
          <p className="text-sm text-gray-600">
            Please talk to a team lead to have your email added.
          </p>
          <button
            type="button"
            onClick={() => { setMode('signin'); resetSignupState(); setEmail('') }}
            className={btn}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  // Signup step 1: email check
  if (mode === 'signup' && signupStep === 1) {
    return (
      <div className={wrapper}>
        <form onSubmit={handleCheckEmail} className={card}>
          <div className="text-center">
            <h1 className={heading}>Create Account</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your email to get started</p>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            placeholder="Email"
            className={input}
            autoFocus
            required
          />

          <p className="text-xs text-gray-600 text-center -mt-1">
            Use the address a lead invited. Forgot your password later? A lead
            can reset it for you in User Management.
          </p>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button type="submit" disabled={submitting} className={btn}>
            {submitting ? 'Checking...' : 'Continue'}
          </button>

          <p className="text-sm text-center text-gray-500">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { setMode('signin'); resetSignupState() }}
              className="text-brand-gold-ink font-semibold hover:underline"
            >
              Sign In
            </button>
          </p>

          {onBack && (
            <p className="text-sm text-center text-gray-500">
              <button
                type="button"
                onClick={onBack}
                className="text-brand-blue-ink font-semibold hover:underline"
              >
                &larr; Back to Welcome
              </button>
            </p>
          )}
        </form>
      </div>
    )
  }

  // Signup step 2: display name + password
  if (mode === 'signup' && signupStep === 2) {
    return (
      <div className={wrapper}>
        <form onSubmit={handleSubmit} className={card}>
          <div className="text-center">
            <h1 className={heading}>Welcome!</h1>
            <p className="text-sm text-gray-500 mt-1">Create your account</p>
          </div>

          <div className="text-center text-sm text-gray-500">
            <span className="font-medium text-gray-700">{email}</span>
            <span className="ml-1 text-green-700">&#10003;</span>
          </div>

          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setError('') }}
            placeholder="Display name"
            className={input}
            autoFocus
          />

          <PasswordInput
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Password"
            className={input}
          />

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button type="submit" disabled={submitting} className={btn}>
            {submitting ? 'Creating account...' : 'Sign Up'}
          </button>

          <p className="text-sm text-center text-gray-500">
            <button
              type="button"
              onClick={() => { setSignupStep(1); setPassword(''); setDisplayName(''); setError('') }}
              className="text-brand-gold-ink font-semibold hover:underline"
            >
              Back
            </button>
          </p>
        </form>
      </div>
    )
  }

  // Forgot password screen
  if (forgotPassword) {
    if (resetSent) {
      return (
        <div className={wrapper}>
          <div className={`${card} text-center`}>
            <h1 className={heading}>Check Your Email</h1>
            <p className="text-sm text-gray-600">
              We sent a password reset link to <span className="font-medium text-gray-700">{email}</span>.
            </p>
            <p className="text-sm text-gray-600">
              Check your inbox (and spam/junk folder) and follow the link to reset your password. Only the link in the newest email works.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Note: Emails can take a few minutes. If it never arrives, ask a team lead to reset your password from the Supabase dashboard.
            </p>
            <button
              type="button"
              onClick={() => { setForgotPassword(false); setResetSent(false); setError('') }}
              className={btn}
            >
              Back to Sign In
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className={wrapper}>
        <form onSubmit={async (e) => {
          e.preventDefault()
          setError('')
          setSubmitting(true)
          try {
            await resetPassword(email)
            setResetSent(true)
          } catch (err) {
            setError(err.message)
          } finally {
            setSubmitting(false)
          }
        }} className={card}>
          <div className="text-center">
            <h1 className={heading}>Reset Password</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your email to receive a reset link</p>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            placeholder="Email"
            className={input}
            autoFocus
            required
          />

          <p className="text-xs text-gray-600 text-center -mt-1">
            If this is a school address and nothing arrives, it was probably
            blocked — ask a lead to change your email to a personal one.
          </p>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button type="submit" disabled={submitting} className={btn}>
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>

          <p className="text-sm text-center text-gray-500">
            <button
              type="button"
              onClick={() => { setForgotPassword(false); setError('') }}
              className="text-brand-gold-ink font-semibold hover:underline"
            >
              Back to Sign In
            </button>
          </p>
        </form>
      </div>
    )
  }

  // Sign-in form, with the visiting-team box beneath it.
  return (
    <div className={wrapper}>
        <form onSubmit={handleSubmit} className={card}>
          <div className="text-center">
            <h1 className={heading}>Sign In</h1>
            <p className="text-sm text-gray-500 mt-1">Welcome back</p>
          </div>

          {linkError && (
            <div className="bg-brand-silver/30 text-orange-700 text-sm text-center px-3 py-2 rounded-lg">
              {linkError}
            </div>
          )}

          {sessionExpired && (
            <div className="bg-brand-silver/30 text-orange-700 text-sm text-center px-3 py-2 rounded-lg">
              Your session has expired. Please log in again.
            </div>
          )}

          {/* Everyone gives all three. The number says which team you are
              on — ours is 7196 — and the email says who you are. */}
          <input
            type="text"
            inputMode="numeric"
            value={teamNumber}
            onChange={(e) => { setTeamNumber(e.target.value.replace(/[^0-9]/g, '')); setError('') }}
            placeholder="Team number"
            className={input}
            autoFocus
          />

          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            placeholder="Email"
            className={input}
          />

          <PasswordInput
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Password"
            className={input}
          />

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !teamNumber.trim() || !email.trim() || !password.trim()}
            className={btn}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-sm text-center text-gray-500">
            <button
              type="button"
              onClick={() => { setForgotPassword(true); setError('') }}
              className="text-brand-gold-ink font-semibold hover:underline"
            >
              Forgot password?
            </button>
          </p>

          {/* A lead invites an address in User Management; that person then
              makes their own account here. */}
          <p className="text-xs text-center text-gray-600">
            Invited by a lead?{' '}
            <button
              type="button"
              onClick={() => { setMode('signup'); setError('') }}
              className="text-brand-gold-ink font-semibold hover:underline"
            >
              Create your account
            </button>
          </p>

          {onBack && (
            <p className="text-sm text-center text-gray-500">
              <button
                type="button"
                onClick={onBack}
                className="text-brand-blue-ink font-semibold hover:underline"
              >
                &larr; Back to Welcome
              </button>
            </p>
          )}
        </form>

      {/* ── Visiting teams ──────────────────────────────────────────────── */}
      {/* Its own form, so Enter in the number field signs the team in instead
          of submitting the email above. Teams sign in as
          team<number>@teams.radical — an address that isn't real and couldn't
          be typed from memory, which is why the number is all they need. */}
    </div>
  )
}

export default LoginScreen
