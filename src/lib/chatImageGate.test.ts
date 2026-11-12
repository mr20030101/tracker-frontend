import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_IMAGES_PER_DAY,
  handleUploadChatImage,
  handleViewChatImage,
  type ChatImageEnv,
} from './chatImageGate'
import { resetDriveFolderCache, resetDriveTokenCache } from './googleDrive'

const ENV: ChatImageEnv = {
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
  new Request('https://tracker.example/api/chat-image', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' } : { 'Content-Type': 'image/jpeg' },
    body,
  })

const view = (ref: string, token: string | null = 'user-token') =>
  new Request(`https://tracker.example/api/chat-image?ref=${encodeURIComponent(ref)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

function fakeFetch({ user = true, active = true, uploadsToday = 0, canView = true, record = true } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return user ? Response.json({ id: 'user-1', email: 'cb@example.com' }) : new Response(null, { status: 401 })
    if (url.includes('/rest/v1/profiles')) return Response.json([{ is_active: active, must_change_password: false }])
    if (url.includes('/rest/v1/chat_image_uploads') && init?.method === 'HEAD') {
      return new Response(null, { headers: { 'content-range': `*/${uploadsToday}` } })
    }
    if (url.includes('/rest/v1/chat_image_uploads')) return new Response(null, { status: record ? 201 : 500 })
    if (url.endsWith('/rest/v1/rpc/can_view_chat_image')) return Response.json(canView)
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'google-token', expires_in: 3600 })
    if (url.includes('/upload/drive/v3/files')) return Response.json({ id: 'drive-file-123' })
    if (url.includes('/drive/v3/files?q=')) return Response.json({ files: [{ id: 'chat-folder' }] })
    if (url.includes('/drive/v3/files/')) return new Response(jpeg(), { headers: { 'Content-Type': 'image/jpeg' } })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

beforeEach(() => {
  resetDriveTokenCache()
  resetDriveFolderCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('handleUploadChatImage', () => {
  it('uploads to Drive, records the upload as the caller, and returns the ref', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleUploadChatImage(upload(jpeg()), ENV, fetchImpl)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ref: 'drive-file-123' })
    const recordCall = fetchImpl.mock.calls.find(([url, init]) => String(url).endsWith('/chat_image_uploads') && init?.method === 'POST')
    expect(JSON.parse(String(recordCall?.[1]?.body))).toEqual({ user_id: 'user-1', drive_file_id: 'drive-file-123' })
  })

  it('refuses anyone not signed in, or inactive', async () => {
    expect((await handleUploadChatImage(upload(jpeg(), null), ENV, fakeFetch())).status).toBe(401)
    expect((await handleUploadChatImage(upload(jpeg()), ENV, fakeFetch({ user: false }))).status).toBe(401)
    expect((await handleUploadChatImage(upload(jpeg()), ENV, fakeFetch({ active: false }))).status).toBe(401)
  })

  it('refuses files that are not JPEGs, or too large', async () => {
    expect((await handleUploadChatImage(upload(new Uint8Array(4096)), ENV, fakeFetch())).status).toBe(400)
    expect((await handleUploadChatImage(upload(jpeg(MAX_CHAT_IMAGE_BYTES + 1)), ENV, fakeFetch())).status).toBe(413)
  })

  it('stops at the daily cap without touching Drive', async () => {
    const fetchImpl = fakeFetch({ uploadsToday: MAX_CHAT_IMAGES_PER_DAY })
    expect((await handleUploadChatImage(upload(jpeg()), ENV, fetchImpl)).status).toBe(429)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('googleapis.com'))).toBe(false)
  })

  it('fails when the upload cannot be recorded, so no unrecorded ref is handed out', async () => {
    expect((await handleUploadChatImage(upload(jpeg()), ENV, fakeFetch({ record: false }))).status).toBe(500)
  })

  it('says photos are unavailable when Drive is not configured', async () => {
    const response = await handleUploadChatImage(upload(jpeg()), { ...ENV, GOOGLE_DRIVE_FOLDER_ID: undefined }, fakeFetch())
    expect(response.status).toBe(500)
  })
})

describe('handleViewChatImage', () => {
  it('serves the image to someone the database allows', async () => {
    const response = await handleViewChatImage(view('drive-file-123'), ENV, fakeFetch())
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('hides it from anyone else, and rejects malformed refs before asking', async () => {
    expect((await handleViewChatImage(view('drive-file-123'), ENV, fakeFetch({ canView: false }))).status).toBe(404)
    expect((await handleViewChatImage(view('drive-file-123', null), ENV, fakeFetch())).status).toBe(401)
    const fetchImpl = fakeFetch()
    expect((await handleViewChatImage(view('../etc/passwd'), ENV, fetchImpl)).status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
