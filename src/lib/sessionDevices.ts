import { supabase } from './api'
import { ONLINE_THRESHOLD_MS } from './presence'

export const EXTENSION_DEVICE = 'Browser extension'
const SIGNED_OUT_NOTICE_KEY = 'signed-out-notice'

/** For the sign-in page, after an admin signed this device out. */
export function leaveSignedOutNotice() {
  try {
    sessionStorage.setItem(SIGNED_OUT_NOTICE_KEY, 'This device was signed out. Sign in again to continue.')
  } catch {
    // Storage blocked: the sign-in page just shows without the note.
  }
}

export function takeSignedOutNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(SIGNED_OUT_NOTICE_KEY)
    sessionStorage.removeItem(SIGNED_OUT_NOTICE_KEY)
    return notice
  } catch {
    return null
  }
}

export interface UserSession {
  session_id: string
  device: string | null
  user_agent: string | null
  sign_in_ip: string | null
  last_ip: string | null
  signed_in_at: string
  last_active: string
  via_link: boolean
  is_new_device: boolean
}

export interface SessionFlag {
  user_id: string
  active_places: number
  new_device: boolean
}

/** "Chrome on Windows", from a user agent. Order matters: Edge and Opera also say Chrome, Chrome also says Safari. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser'
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Mac OS X|Macintosh/.test(ua)
              ? 'Mac'
              : /Linux/.test(ua)
                ? 'Linux'
                : null
  return os ? `${browser} on ${os}` : browser
}

/** The device a sign-in is on: what its page reported, or else read from the user agent it signed in with. */
export function sessionDevice(session: Pick<UserSession, 'device' | 'user_agent'>): string {
  return session.device && session.device !== 'Unknown device' ? session.device : deviceLabel(session.user_agent)
}

/** Places (device + IP) an account is active from right now, leaving out the extension and link sign-ins. */
export function activePlaces(sessions: UserSession[], now = Date.now()): number {
  const places = new Set<string>()
  for (const s of sessions) {
    if (s.via_link || s.device === EXTENSION_DEVICE) continue
    if (now - new Date(s.last_active).getTime() > ONLINE_THRESHOLD_MS) continue
    places.add(`${sessionDevice(s)}|${s.last_ip ?? s.sign_in_ip ?? ''}`)
  }
  return places.size
}

export function isActiveNow(session: UserSession, now = Date.now()): boolean {
  return now - new Date(session.last_active).getTime() <= ONLINE_THRESHOLD_MS
}

/** The sign-in this page is using, from the session_id claim in its access token. */
export async function currentSessionId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

export async function listUserSessions(userId: string): Promise<UserSession[]> {
  const { data, error } = await supabase.rpc('list_user_sessions', { p_user_id: userId })
  if (error) throw error
  return (data ?? []) as UserSession[]
}

export async function fetchSessionFlags(): Promise<SessionFlag[]> {
  const { data, error } = await supabase.rpc('session_flags')
  if (error) throw error
  return (data ?? []) as SessionFlag[]
}

export async function revokeUserSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_user_session', { p_session_id: sessionId })
  if (error) throw error
}
