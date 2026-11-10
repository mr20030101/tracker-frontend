import { beforeEach, describe, expect, it, vi } from 'vitest'
import { driveSubfolder, resetDriveFolderCache, resetDriveTokenCache, type DriveEnv } from './googleDrive'

const ENV: DriveEnv = {
  GOOGLE_DRIVE_FOLDER_ID: 'root',
  GOOGLE_OAUTH_CLIENT_ID: 'client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
}

// A fake Drive: `existing` are folder ids already there (oldest first); a created one is added
// after them, or before them when `racedBy` says another upload created one a moment earlier.
function fakeDrive({ existing = [] as string[], racedBy = null as string | null } = {}) {
  const folders = [...existing]
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'token', expires_in: 3600 })
    if (url.includes('/drive/v3/files?q=')) return Response.json({ files: folders.map((id) => ({ id })) })
    if (url.includes('/drive/v3/files?') && init?.method === 'POST') {
      if (racedBy) folders.push(racedBy)
      folders.push('mine')
      return Response.json({ id: 'mine' })
    }
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

const created = (fetchImpl: ReturnType<typeof fakeDrive>) => fetchImpl.mock.calls.filter(([url, init]) => String(url).includes('/drive/v3/files?') && init?.method === 'POST')
const deleted = (fetchImpl: ReturnType<typeof fakeDrive>) => fetchImpl.mock.calls.filter(([, init]) => init?.method === 'DELETE')

beforeEach(() => {
  resetDriveTokenCache()
  resetDriveFolderCache()
})

describe('driveSubfolder', () => {
  it("uses the day's folder when it's already there", async () => {
    const fetchImpl = fakeDrive({ existing: ['day'] })
    expect(await driveSubfolder(ENV, '2026-11-11', fetchImpl)).toBe('day')
    expect(created(fetchImpl)).toHaveLength(0)
  })

  it('creates it inside the attendance folder when it isn’t', async () => {
    const fetchImpl = fakeDrive()
    expect(await driveSubfolder(ENV, '2026-11-11', fetchImpl)).toBe('mine')
    expect(JSON.parse(String(created(fetchImpl)[0][1]?.body))).toEqual({
      name: '2026-11-11',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    })
    expect(deleted(fetchImpl)).toHaveLength(0)
  })

  it('keeps the older folder when two uploads create it at once, and removes its own', async () => {
    const fetchImpl = fakeDrive({ racedBy: 'theirs' })
    expect(await driveSubfolder(ENV, '2026-11-11', fetchImpl)).toBe('theirs')
    expect(String(deleted(fetchImpl)[0][0])).toContain('/files/mine')
  })

  it('remembers the folder for the next upload', async () => {
    const fetchImpl = fakeDrive({ existing: ['day'] })
    await driveSubfolder(ENV, '2026-11-11', fetchImpl)
    const calls = fetchImpl.mock.calls.length
    expect(await driveSubfolder(ENV, '2026-11-11', fetchImpl)).toBe('day')
    expect(fetchImpl.mock.calls.length).toBe(calls)
  })
})
