// A minimal Google Drive client for the Vercel Functions (no googleapis package): get an access
// token, upload a file into a folder, and download one. Kept free of browser and Vercel APIs so it
// can be tested with a fake fetch.
//
// Two ways to sign in, whichever is configured:
//   - A Google account's OAuth refresh token (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//     GOOGLE_OAUTH_REFRESH_TOKEN): files land in that account's Drive. Works with a plain Gmail account.
//   - A service account (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY): needs the
//     folder to be in a Shared Drive the service account is a member of (Google Workspace), since a
//     service account has no storage of its own.
// GOOGLE_DRIVE_FOLDER_ID is the folder the files go in.

export interface DriveEnv {
  GOOGLE_DRIVE_FOLDER_ID?: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  GOOGLE_OAUTH_REFRESH_TOKEN?: string
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive'

export function driveConfigured(env: DriveEnv): boolean {
  const oauth = env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN
  const serviceAccount = env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  return Boolean(env.GOOGLE_DRIVE_FOLDER_ID && (oauth || serviceAccount))
}

// Reused while a warm function instance lives, so most requests skip the token exchange.
let cachedToken: { token: string; expiresAt: number } | null = null

/** Forgets the cached token (for tests). */
export function resetDriveTokenCache() {
  cachedToken = null
}

// btoa/atob rather than Buffer, so this typechecks with the app's browser types too.
function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// A service account signs its own short JWT (RS256) and trades it for an access token.
async function serviceAccountAssertion(email: string, privateKeyPem: string): Promise<string> {
  // Environment variables often carry the key's newlines as a literal "\n".
  const pem = privateKeyPem.replace(/\\n/g, '\n')
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64url(signature)}`
}

export async function driveAccessToken(env: DriveEnv, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const form =
    env.GOOGLE_OAUTH_REFRESH_TOKEN && env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
      ? new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
          client_id: env.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        })
      : new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: await serviceAccountAssertion(env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '', env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? ''),
        })

  const response = await fetchImpl(TOKEN_URL, { method: 'POST', body: form })
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null
  if (!response.ok || !body?.access_token) throw new Error(`Google sign-in failed: ${body?.error ?? response.status}`)
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return body.access_token
}

/** Uploads a file into GOOGLE_DRIVE_FOLDER_ID and returns its Drive file id. */
export async function uploadToDrive(
  env: DriveEnv,
  file: { name: string; mimeType: string; data: Uint8Array<ArrayBuffer>; description?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const token = await driveAccessToken(env, fetchImpl)
  const boundary = `tracker-${crypto.randomUUID()}`
  const metadata = JSON.stringify({
    name: file.name,
    mimeType: file.mimeType,
    parents: [env.GOOGLE_DRIVE_FOLDER_ID],
    description: file.description,
  })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    file.data,
    `\r\n--${boundary}--`,
  ])
  const response = await fetchImpl(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  )
  const result = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!response.ok || !result?.id) throw new Error(`Drive upload failed: ${result?.error?.message ?? response.status}`)
  return result.id
}

/** A Drive file's contents, or null if it isn't there (deleted, or not shared with this account). */
export async function downloadFromDrive(env: DriveEnv, fileId: string, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  const token = await driveAccessToken(env, fetchImpl)
  const response = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (response.status === 404 || response.status === 403) return null
  if (!response.ok) throw new Error(`Drive download failed: ${response.status}`)
  return response
}
