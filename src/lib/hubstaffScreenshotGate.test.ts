import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_HUBSTAFF_SCREENSHOT_BYTES,
  MAX_HUBSTAFF_SCREENSHOTS_PER_DAY,
  handleUploadHubstaffScreenshot,
  handleViewHubstaffScreenshot,
  type HubstaffScreenshotEnv,
} from './hubstaffScreenshotGate'
import { resetDriveFolderCache, resetDriveTokenCache } from './googleDrive'

const ENV: HubstaffScreenshotEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GOOGLE_DRIVE_FOLDER_ID: 'folder',
  GOOGLE_OAUTH_CLIENT_ID: 'client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
}

const jpeg = (size = 4096): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff])
  return bytes
}

const upload = (body: Uint8Array<ArrayBuffer>, token: string | null = 'user-token') =>
  new Request('https://tracker.example/api/hubstaff-screenshot', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' } : { 'Content-Type': 'image/jpeg' },
    body,
  })

const view = (ref: string, token: string | null = 'user-token') =>
  new Request(`https://tracker.example/api/hubstaff-screenshot?ref=${encodeURIComponent(ref)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

function fakeFetch({ user = true, active = true, canFile = true, uploadsToday = 0, canView = true, record = true } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return user ? Response.json({ id: 'user-1', email: 'cb@example.com' }) : new Response(null, { status: 401 })
    if (url.includes('/rest/v1/profiles')) return Response.json([{ is_active: active, must_change_password: false }])
    if (url.endsWith('/rest/v1/rpc/can_file_hubstaff')) return Response.json(canFile)
    if (url.includes('/rest/v1/hubstaff_screenshot_uploads') && init?.method === 'HEAD') {
      return new Response(null, { headers: { 'content-range': `*/${uploadsToday}` } })
    }
    if (url.includes('/rest/v1/hubstaff_screenshot_uploads')) return new Response(null, { status: record ? 201 : 500 })
    if (url.endsWith('/rest/v1/rpc/can_view_hubstaff_screenshot')) return Response.json(canView)
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'google-token', expires_in: 3600 })
    if (url.includes('/upload/drive/v3/files')) return Response.json({ id: 'drive-file-123' })
    if (url.includes('/drive/v3/files?q=')) return Response.json({ files: [{ id: 'hubstaff-folder' }] })
    if (url.includes('/drive/v3/files/')) return new Response(jpeg(), { headers: { 'Content-Type': 'image/jpeg' } })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

beforeEach(() => {
  resetDriveTokenCache()
  resetDriveFolderCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('handleUploadHubstaffScreenshot', () => {
  it('uploads to Drive, records the upload as the caller, and returns the ref', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleUploadHubstaffScreenshot(upload(jpeg()), ENV, fetchImpl)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ref: 'drive-file-123' })
    const recordCall = fetchImpl.mock.calls.find(([url, init]) => String(url).endsWith('/hubstaff_screenshot_uploads') && init?.method === 'POST')
    expect(JSON.parse(String(recordCall?.[1]?.body))).toEqual({ user_id: 'user-1', drive_file_id: 'drive-file-123' })
  })

  it('refuses anyone not signed in, or inactive', async () => {
    expect((await handleUploadHubstaffScreenshot(upload(jpeg(), null), ENV, fakeFetch())).status).toBe(401)
    expect((await handleUploadHubstaffScreenshot(upload(jpeg()), ENV, fakeFetch({ user: false }))).status).toBe(401)
    expect((await handleUploadHubstaffScreenshot(upload(jpeg()), ENV, fakeFetch({ active: false }))).status).toBe(401)
  })

  it('refuses anyone who is not an RST contributor, before touching Drive', async () => {
    const fetchImpl = fakeFetch({ canFile: false })
    expect((await handleUploadHubstaffScreenshot(upload(jpeg()), ENV, fetchImpl)).status).toBe(403)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('googleapis'))).toBe(false)
  })

  it('refuses files that are not JPEGs, or too large', async () => {
    expect((await handleUploadHubstaffScreenshot(upload(new Uint8Array(4096)), ENV, fakeFetch())).status).toBe(400)
    expect((await handleUploadHubstaffScreenshot(upload(jpeg(100)), ENV, fakeFetch())).status).toBe(400)
    expect((await handleUploadHubstaffScreenshot(upload(jpeg(MAX_HUBSTAFF_SCREENSHOT_BYTES + 1)), ENV, fakeFetch())).status).toBe(413)
  })

  it('stops at the daily cap', async () => {
    const response = await handleUploadHubstaffScreenshot(upload(jpeg()), ENV, fakeFetch({ uploadsToday: MAX_HUBSTAFF_SCREENSHOTS_PER_DAY }))
    expect(response.status).toBe(429)
  })

  it('fails if the upload cannot be recorded', async () => {
    expect((await handleUploadHubstaffScreenshot(upload(jpeg()), ENV, fakeFetch({ record: false }))).status).toBe(500)
  })

  it('fails closed when the server is not configured', async () => {
    expect((await handleUploadHubstaffScreenshot(upload(jpeg()), { ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined }, fakeFetch())).status).toBe(500)
  })
})

describe('handleViewHubstaffScreenshot', () => {
  it('returns the image to someone who can see the entry', async () => {
    const response = await handleViewHubstaffScreenshot(view('drive-file-123'), ENV, fakeFetch())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
  })

  it('hides it from anyone else', async () => {
    expect((await handleViewHubstaffScreenshot(view('drive-file-123'), ENV, fakeFetch({ canView: false }))).status).toBe(404)
    expect((await handleViewHubstaffScreenshot(view('drive-file-123', null), ENV, fakeFetch())).status).toBe(401)
  })

  it('rejects malformed refs', async () => {
    expect((await handleViewHubstaffScreenshot(view('../etc'), ENV, fakeFetch())).status).toBe(400)
  })
})
