// "Log in as" in the browser: an admin swaps their session for a lead's or contributor's (via
// api/login-as, see loginAsGate.ts) and can swap back. The admin's own session is kept aside in
// this browser's storage — where Supabase keeps sessions anyway — until they return.
import { supabase } from './api'

const RETURN_KEY = 'login-as-return'

export interface LoginAsReturn {
  access_token: string
  refresh_token: string
  target_id: string
  target_name: string
}

/** Set while an admin is logged in as someone else in this browser. */
export function loginAsReturn(): LoginAsReturn | null {
  try {
    const value = JSON.parse(localStorage.getItem(RETURN_KEY) ?? 'null') as LoginAsReturn | null
    return value?.refresh_token && value.target_id ? value : null
  } catch {
    return null
  }
}

function clearReturn() {
  try {
    localStorage.removeItem(RETURN_KEY)
  } catch {
    // Nothing to clear.
  }
}

export async function loginAs(userId: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const own = data.session
  if (!own) throw new Error('Sign in again.')
  const response = await fetch('/api/login-as', {
    method: 'POST',
    headers: { Authorization: `Bearer ${own.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  })
  const body = (await response.json().catch(() => null)) as { token_hash?: string; type?: string; name?: string; message?: string } | null
  if (!response.ok || !body?.token_hash) throw new Error(body?.message || "Couldn't log in as them.")

  const back: LoginAsReturn = { access_token: own.access_token, refresh_token: own.refresh_token, target_id: userId, target_name: body.name ?? '' }
  try {
    localStorage.setItem(RETURN_KEY, JSON.stringify(back))
  } catch {
    throw new Error("This browser won't keep your own session aside, so you couldn't get back. Allow site storage and try again.")
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: body.type === 'email' ? 'email' : 'magiclink' })
  if (error) {
    clearReturn()
    throw new Error(error.message)
  }
  // A fresh load, so nothing fetched as the admin is shown as theirs.
  window.location.assign('/')
}

/**
 * Ends the borrowed session and puts the admin's own back. Only this browser's copy is signed out
 * (scope: local): a global sign-out would sign the person out on their own devices too.
 */
export async function returnToOwnAccount(): Promise<void> {
  const back = loginAsReturn()
  await supabase.auth.signOut({ scope: 'local' })
  clearReturn()
  if (back) await supabase.auth.setSession({ access_token: back.access_token, refresh_token: back.refresh_token })
  window.location.assign('/users')
}
