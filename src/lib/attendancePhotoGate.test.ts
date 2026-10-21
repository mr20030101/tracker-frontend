import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleUploadAttendancePhoto, handleViewAttendancePhoto, MAX_PHOTO_BYTES, type AttendancePhotoEnv } from './attendancePhotoGate'
import { resetDriveTokenCache } from './googleDrive'

const ENV: AttendancePhotoEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GOOGLE_DRIVE_FOLDER_ID: 'folder',
  GOOGLE_OAUTH_CLIENT_ID: 'client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
}

// 10:00 AM Singapore on an ordinary day: inside the window.
const OPEN = new Date('2026-10-16T10:00:00+08:00')
const CLOSED = new Date('2026-10-16T15:00:00+08:00')

const jpeg = (size = 4096): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff])
  return bytes
}

function upload(body: Uint8Array<ArrayBuffer>, token: string | null = 'user-token') {
  return new Request('https://tracker.example/api/attendance-photo', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' } : { 'Content-Type': 'image/jpeg' },
    body,
  })
}

// Answers Supabase auth/profile/count/insert, Google's token and Drive calls; records every call.
function fakeFetch({ user = true, active = true, uploadsToday = 0, visibleEntries = 1, closesMin = 810 } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return user ? Response.json({ id: 'user-1', email: 'cb@example.com' }) : new Response(null, { status: 401 })
    if (url.includes('/rest/v1/profiles')) return Response.json([{ is_active: active, must_change_password: false }])
    if (url.endsWith('/rest/v1/rpc/attendance_closes_min')) return Response.json(closesMin)
    if (url.includes('/rest/v1/attendance_photo_uploads') && init?.method === 'HEAD') {
      return new Response(null, { headers: { 'content-range': `*/${uploadsToday}` } })
    }
    if (url.includes('/rest/v1/attendance_photo_uploads')) return new Response(null, { status: 201 })
    if (url.includes('/rest/v1/attendance')) return Response.json(Array.from({ length: visibleEntries }, (_, i) => ({ id: i })))
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'google-token', expires_in: 3600 })
    if (url.includes('/upload/drive/v3/files')) return Response.json({ id: 'drive-file-123' })
    if (url.includes('/drive/v3/files/')) return new Response(jpeg(), { headers: { 'Content-Type': 'image/jpeg' } })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

beforeEach(resetDriveTokenCache)

describe('handleUploadAttendancePhoto', () => {
  it('uploads to Drive, records the upload and returns the reference', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleUploadAttendancePhoto(upload(jpeg()), ENV, fetchImpl, OPEN)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ref: 'drive-file-123' })
    const record = fetchImpl.mock.calls.find(([url, init]) => String(url).endsWith('/attendance_photo_uploads') && init?.method === 'POST')
    expect(JSON.parse(String(record?.[1]?.body))).toEqual({ user_id: 'user-1', drive_file_id: 'drive-file-123' })
    // Named with the day and Singapore time, so a retake is its own file.
    const driveUpload = fetchImpl.mock.calls.find(([url]) => String(url).includes('/upload/drive/v3/files'))
    expect(await new Response(driveUpload?.[1]?.body as Blob).text()).toContain('"name":"2026-10-16 10.00.00 cb@example.com.jpg"')
  })

  it('refuses without a valid session, or for an inactive account', async () => {
    expect((await handleUploadAttendancePhoto(upload(jpeg(), null), ENV, fakeFetch(), OPEN)).status).toBe(401)
    expect((await handleUploadAttendancePhoto(upload(jpeg()), ENV, fakeFetch({ user: false }), OPEN)).status).toBe(401)
    expect((await handleUploadAttendancePhoto(upload(jpeg()), ENV, fakeFetch({ active: false }), OPEN)).status).toBe(401)
  })

  it('refuses outside the attendance window', async () => {
    expect((await handleUploadAttendancePhoto(upload(jpeg()), ENV, fakeFetch(), CLOSED)).status).toBe(403)
  })

  it("follows the caller's team closing time", async () => {
    expect((await handleUploadAttendancePhoto(upload(jpeg()), ENV, fakeFetch({ closesMin: 16 * 60 }), CLOSED)).status).toBe(200)
    const early = await handleUploadAttendancePhoto(upload(jpeg()), ENV, fakeFetch({ closesMin: 9 * 60 }), OPEN)
    expect(early.status).toBe(403)
    expect(await early.json()).toEqual({ message: 'Attendance is only taken from 6:00 AM to 9:00 AM.' })
  })

  it('refuses anything that is not a small JPEG, before touching Drive', async () => {
    const fetchImpl = fakeFetch()
    expect((await handleUploadAttendancePhoto(upload(new Uint8Array(4096)), ENV, fetchImpl, OPEN)).status).toBe(400)
    expect((await handleUploadAttendancePhoto(upload(jpeg(MAX_PHOTO_BYTES + 1)), ENV, fetchImpl, OPEN)).status).toBe(413)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('googleapis.com'))).toBe(false)
  })

  it('stops after the daily retake limit', async () => {
    expect((await handleUploadAttendancePhoto(upload(jpeg()), ENV, fakeFetch({ uploadsToday: 10 }), OPEN)).status).toBe(429)
  })

  it('reports a server without Drive settings as unavailable', async () => {
    const response = await handleUploadAttendancePhoto(upload(jpeg()), { ...ENV, GOOGLE_DRIVE_FOLDER_ID: undefined }, fakeFetch(), OPEN)
    expect(response.status).toBe(500)
  })
})

describe('handleViewAttendancePhoto', () => {
  const view = (ref: string) =>
    new Request(`https://tracker.example/api/attendance-photo?ref=${ref}`, { headers: { Authorization: 'Bearer user-token' } })

  it('returns the photo when the caller can see that entry', async () => {
    const response = await handleViewAttendancePhoto(view('drive-file-123'), ENV, fakeFetch())
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toContain('private')
  })

  it("refuses when the caller can't see the entry, without asking Drive", async () => {
    const fetchImpl = fakeFetch({ visibleEntries: 0 })
    expect((await handleViewAttendancePhoto(view('drive-file-123'), ENV, fetchImpl)).status).toBe(404)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('googleapis.com'))).toBe(false)
  })

  it('checks visibility with the caller’s own token, not the service key', async () => {
    const fetchImpl = fakeFetch()
    await handleViewAttendancePhoto(view('drive-file-123'), ENV, fetchImpl)
    const check = fetchImpl.mock.calls.find(([url]) => String(url).includes('/rest/v1/attendance?'))
    expect((check?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer user-token')
  })

  it('rejects a malformed reference', async () => {
    expect((await handleViewAttendancePhoto(view('../etc'), ENV, fakeFetch())).status).toBe(400)
  })
})
