import { supabase } from './api'

// Attendance photos go to Google Drive through api/attendance-photo (see attendancePhotoGate.ts),
// signed with the user's own Supabase session.
const ENDPOINT = '/api/attendance-photo'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again to file attendance.')
  return { Authorization: `Bearer ${token}` }
}

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null
  return new Error(body?.message || fallback)
}

/** Uploads the camera's photo and returns the reference to file attendance with. */
export async function uploadAttendancePhoto(photo: Blob): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'image/jpeg' },
    body: photo,
  })
  if (!response.ok) throw await failure(response, "Your photo couldn't be saved. Please try again.")
  return ((await response.json()) as { ref: string }).ref
}

/** An attendance entry's photo as an object URL; revoke it when done. */
export async function fetchAttendancePhoto(ref: string): Promise<string> {
  const response = await fetch(`${ENDPOINT}?ref=${encodeURIComponent(ref)}`, { headers: await authHeader() })
  if (!response.ok) throw await failure(response, "This photo couldn't be loaded.")
  return URL.createObjectURL(await response.blob())
}

/**
 * Sends a saved entry to the team's Google Form (api/attendance-google-form). The outcome is also
 * recorded on the entry, so a failure shows on the Attendance page with a Retry.
 */
export async function sendAttendanceToGoogleForm(userId: string, date: string): Promise<void> {
  const response = await fetch('/api/attendance-google-form', {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, date }),
  })
  if (!response.ok) throw await failure(response, "This couldn't be sent to the Google Form.")
}

/** Whether attendance is being sent to the Google Form at all (ATTENDANCE_GOOGLE_FORM in Vercel). */
export async function fetchGoogleFormEnabled(): Promise<boolean> {
  const response = await fetch('/api/attendance-google-form')
  if (!response.ok) return false
  return Boolean(((await response.json()) as { enabled?: boolean }).enabled)
}
