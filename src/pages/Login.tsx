import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/api'
import { Lock, Mail } from 'lucide-react'
import { ErrorNote, LinkButton, PlayfulInput, RevealToggle, SubmitButton, SuccessNote } from '../components/PlayfulForm'
import type { OwlMood } from '../components/LoginOwl'
import { CardHeading, PerchedCard } from '../components/PerchedCard'
import { useReveal } from '../lib/motion'

// Shows the "Forgot password?" link. It relies on Supabase delivering the reset
// email, which needs custom SMTP under Authentication > SMTP (the built-in sender
// only reaches team members, at 2 an hour) and this site's address in Authentication
// > URL Configuration (Site URL = SITE_URL below). If emails stop arriving, set this
// to false and an admin can reset passwords from Users > Reset Password instead.
const FORGOT_PASSWORD_ENABLED = true

// Where the reset email's link sends people, whichever address they requested it from (a Vercel
// preview, say). The site root is always accepted once it is the Supabase Site URL; the recovery
// form is shown from any route, so it doesn't need to be /login.
const SITE_URL = 'https://greyowlstracker.space'

export function Login() {
  const { login, recovering, clearRecovery } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const cardRef = useReveal<HTMLDivElement>({
    self: true,
    selector: ':scope > div:nth-child(2), :scope > form > *',
    step: 70,
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'forgot' | 'recovery'>(recovering ? 'recovery' : 'login')
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState<'email' | 'password' | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Set on a failed sign-in; cleared when the card's shake finishes, so the next failure replays it.
  const [shaking, setShaking] = useState(false)

  function switchMode(next: 'login' | 'forgot') {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.')
      setShaking(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${import.meta.env.DEV ? window.location.origin : SITE_URL}/`,
      })
      if (resetError) throw resetError
      setNotice('Check your email for a password reset link.')
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not send the reset email.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRecovery(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      await supabase.auth.signOut()
      clearRecovery()
      navigate('/login', { replace: true, state: { notice: 'Password updated. You can now sign in.' } })
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update the password.')
    } finally {
      setSubmitting(false)
    }
  }

  // The mascot follows the email caret, hides its eyes for the password, and peeks when it's shown.
  const lookX = focused === 'email' ? Math.min(email.length / 28, 1) * 2 - 1 : 0
  const mood: OwlMood = focused === 'password' ? (showPassword ? 'peek' : 'cover') : 'idle'
  // Down at the form while typing, but up over the wings when peeking.
  const lookY = mood === 'peek' ? -1 : focused ? 1 : 0

  const heading =
    mode === 'recovery'
      ? { title: 'Fresh start!', subtitle: 'Pick a new password. At least 8 characters.' }
      : mode === 'forgot'
        ? { title: 'Forgot? No worries.', subtitle: "Enter your email and we'll send a reset link." }
        : { title: "Hoo's there?", subtitle: 'Welcome back! Sign in to Grey Owls Tracker.' }

  const focusHandlers = (field: 'email' | 'password') => ({
    onFocus: () => setFocused(field),
    onBlur: () => setFocused((current) => (current === field ? null : current)),
  })

  return (
    <PerchedCard
      lookX={lookX}
      lookY={lookY}
      mood={mood}
      cardRef={cardRef}
      shaking={shaking}
      onShakeEnd={() => setShaking(false)}
    >
      <CardHeading title={heading.title} subtitle={heading.subtitle} />

      {mode === 'recovery' ? (
        <form onSubmit={handleRecovery} className="flex flex-col gap-4">
          <PlayfulInput
            id="new_password"
            label="New password"
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            {...focusHandlers('password')}
            trailing={<RevealToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          />
          {error && <ErrorNote message={error} />}
          <SubmitButton pending={submitting} pendingLabel="Updating..." label="Update password" />
        </form>
      ) : mode === 'forgot' ? (
        <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
          <PlayfulInput
            id="reset_email"
            label="Email"
            icon={Mail}
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...focusHandlers('email')}
          />
          {error && <ErrorNote message={error} />}
          {notice && <SuccessNote message={notice} />}
          <SubmitButton pending={submitting} pendingLabel="Sending..." label="Send reset link" />
          <LinkButton onClick={() => switchMode('login')}>Back to sign in</LinkButton>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <PlayfulInput
            id="email"
            label="Email"
            icon={Mail}
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...focusHandlers('email')}
          />
          <PlayfulInput
            id="password"
            label="Password"
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...focusHandlers('password')}
            trailing={<RevealToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          />
          {error && <ErrorNote message={error} />}
          {/* e.g. "Password updated" after resetting: they land back here, so it has to show here. */}
          {notice && <SuccessNote message={notice} />}
          <SubmitButton pending={submitting} pendingLabel="Signing in..." label="Sign in" />
          {FORGOT_PASSWORD_ENABLED && <LinkButton onClick={() => switchMode('forgot')}>Forgot password?</LinkButton>}
        </form>
      )}
    </PerchedCard>
  )
}
