// Server side of attendance photos, run by the Vercel Function in api/attendance-photo.ts. Photos
// live in Google Drive (see googleDrive.ts), never in Supabase:
//   POST  the camera's JPEG, from a signed-in contributor during the attendance window. Uploaded to
//         Drive and recorded in attendance_photo_uploads, which file_attendance() checks. Returns
//         { ref }, the Drive file id the form then files with.
//   GET   ?ref=<id>, the photo on an attendance entry, for whoever can read that entry (themselves,
//         their lead, an admin): the check is a read of the entry with the caller's own access.
// Kept free of Vercel and browser APIs so it can be tested with a fake fetch (hence the .js imports).

import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './supabaseConfig.js'
import { attendanceWindow } from './attendanceWindow.js'
import { toISODate, fromISODate } from './week.js'
import { downloadFromDrive, driveConfigured, uploadToDrive, type DriveEnv } from './googleDrive.js'

export interface AttendancePhotoEnv extends DriveEnv {
  SUPABASE_URL?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

// The app shrinks a photo to a few dozen KB; these bound what a hand-made request can send.
export const MAX_PHOTO_BYTES = 300 * 1024
const MIN_PHOTO_BYTES = 1024
// Retakes allowed in one day, so a script can't fill the Drive.
export const MAX_UPLOADS_PER_DAY = 10

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (status: number, message: string) => json(status, { message })

interface Caller {
  id: string
  email: string
  token: string
}

function config(env: AttendancePhotoEnv) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

// The signed-in user behind the request's Supabase access token, if it's valid and their account
// is active (read with their own access, so it's their own profile row).
async function signedInCaller(request: Request, env: AttendancePhotoEnv, fetchImpl: typeof fetch): Promise<Caller | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return null
  const { url, anonKey } = config(env)
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` }
  const userResponse = await fetchImpl(`${url}/auth/v1/user`, { headers })
  if (!userResponse.ok) return null
  const user = (await userResponse.json()) as { id?: string; email?: string }
  if (!user.id) return null
  const profileResponse = await fetchImpl(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=is_active,must_change_password`,
    { headers },
  )
  const [profile] = profileResponse.ok ? ((await profileResponse.json()) as { is_active: boolean; must_change_password: boolean }[]) : []
  if (!profile?.is_active || profile.must_change_password) return null
  return { id: user.id, email: user.email ?? '', token }
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

export async function handleUploadAttendancePhoto(
  request: Request,
  env: AttendancePhotoEnv,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Response> {
  const { url, serviceKey } = config(env)
  if (!serviceKey || !driveConfigured(env)) {
    console.error('api/attendance-photo: SUPABASE_SERVICE_ROLE_KEY or the Google Drive settings are not set.')
    return refuse(500, "Attendance photos can't be saved right now. Please tell your lead.")
  }

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again to file attendance.')
  if (attendanceWindow(now) !== 'open') return refuse(403, 'Attendance is only taken from 6:00 AM to 2:30 PM.')

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length > MAX_PHOTO_BYTES) return refuse(413, 'That photo is too large. Please take it again.')
  if (bytes.length < MIN_PHOTO_BYTES || !isJpeg(bytes)) return refuse(400, 'That photo could not be read. Please take it again.')

  const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const today = toISODate(now)
  const countResponse = await fetchImpl(
    `${url}/rest/v1/attendance_photo_uploads?user_id=eq.${caller.id}&created_at=gte.${encodeURIComponent(fromISODate(today).toISOString())}&select=id`,
    { method: 'HEAD', headers: { ...serviceHeaders, Prefer: 'count=exact' } },
  )
  const uploadedToday = Number(countResponse.headers.get('content-range')?.split('/')[1] ?? 0)
  if (uploadedToday >= MAX_UPLOADS_PER_DAY) return refuse(429, "You've retaken your photo too many times today. Ask your lead to file your attendance.")

  let fileId: string
  try {
    fileId = await uploadToDrive(
      env,
      { name: `${today} ${caller.email || caller.id}.jpg`, mimeType: 'image/jpeg', data: bytes, description: `Attendance photo, ${caller.email} (${caller.id}), ${today}` },
      fetchImpl,
    )
  } catch (error) {
    console.error('api/attendance-photo: upload failed:', error)
    return refuse(502, "Your photo couldn't be saved just now. Please try again.")
  }

  const recordResponse = await fetchImpl(`${url}/rest/v1/attendance_photo_uploads`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: caller.id, drive_file_id: fileId }),
  })
  if (!recordResponse.ok) {
    console.error('api/attendance-photo: recording the upload failed:', recordResponse.status, await recordResponse.text().catch(() => ''))
    return refuse(500, "Your photo couldn't be saved just now. Please try again.")
  }
  return json(200, { ref: fileId })
}

export async function handleViewAttendancePhoto(request: Request, env: AttendancePhotoEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!driveConfigured(env)) return refuse(500, "Attendance photos can't be shown right now.")
  const ref = new URL(request.url).searchParams.get('ref') ?? ''
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(ref)) return refuse(400, 'Not a photo.')

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again to see this photo.')

  // Read with the caller's own access: attendance's RLS decides, so this matches who can see the entry.
  const { url, anonKey } = config(env)
  const entryResponse = await fetchImpl(`${url}/rest/v1/attendance?photo_ref=eq.${encodeURIComponent(ref)}&select=id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${caller.token}` },
  })
  const entries = entryResponse.ok ? ((await entryResponse.json()) as unknown[]) : []
  if (entries.length === 0) return refuse(404, 'Photo not found.')

  let photo: Response | null
  try {
    photo = await downloadFromDrive(env, ref, fetchImpl)
  } catch (error) {
    console.error('api/attendance-photo: download failed:', error)
    return refuse(502, "This photo couldn't be loaded just now.")
  }
  if (!photo) return refuse(404, 'This photo is no longer in Google Drive.')
  return new Response(photo.body, {
    status: 200,
    // Private: only this signed-in viewer's browser keeps it. A photo never changes once taken.
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable' },
  })
}
