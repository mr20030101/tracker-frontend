import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/api'
import { Eye, EyeOff, Lock, Mail, type LucideIcon } from 'lucide-react'
import { LoginOwl, type OwlMood } from '../components/LoginOwl'
import { LoginSky } from '../components/LoginSky'
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-16">
      <LoginSky />
      <div className="relative w-full max-w-sm pt-20">
        {/* Perched on the card: the bottom of the owl tucks behind its top edge. */}
        <div className="absolute left-1/2 top-0 w-28 -translate-x-1/2">
          <LoginOwl lookX={lookX} lookY={lookY} mood={mood} />
        </div>
        <div className={`relative ${shaking ? 'login-shake' : ''}`} onAnimationEnd={(e) => e.animationName === 'login-shake' && setShaking(false)}>
          <div
            ref={cardRef}
            className="relative rounded-3xl border border-gray-200 bg-white px-7 pb-7 pt-8 shadow-xl shadow-black/5"
          >
            {/* Talons gripping the edge, in front of the card. */}
            <div className="absolute -top-1.5 left-1/2 flex -translate-x-1/2 gap-7" aria-hidden="true">
              <span className="h-3 w-5 rounded-full bg-[#f5b301]" />
              <span className="h-3 w-5 rounded-full bg-[#f5b301]" />
            </div>

            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-gray-900">{heading.title}</h1>
              <p className="mt-1 text-sm text-gray-500">{heading.subtitle}</p>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayfulInput({
  id,
  label,
  icon: Icon,
  trailing,
  ...input
}: { id: string; label: string; icon: LucideIcon; trailing?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="group relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-accent" />
        <input
          id={id}
          className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 py-2.5 pl-10 pr-10 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(212,160,23,0.15)]"
          {...input}
        />
        {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </div>
  )
}

function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const Icon = shown ? EyeOff : Eye
  return (
    <button
      type="button"
      // Keep focus in the password field, so the owl stays in peek/cover mode while toggling.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground shadow-[0_4px_0_0_#a87c0c] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_#a87c0c] active:translate-y-1 active:shadow-[0_0_0_0_#a87c0c] disabled:translate-y-0 disabled:opacity-60 disabled:shadow-[0_4px_0_0_#a87c0c]"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-sm font-medium text-sky-700 hover:underline">
      {children}
    </button>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
      {message}
    </div>
  )
}

function SuccessNote({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-xl bg-status-success-bg px-3 py-2 text-sm text-status-success-text">
      {message}
    </div>
  )
}
