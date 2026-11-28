// Server side of Hubstaff screenshots, run by api/hubstaff-screenshot.ts (Vercel) and
// functions/api/hubstaff-screenshot.ts (Cloudflare). Screenshots live in Google Drive (see
// googleDrive.ts), never in Supabase:
//   POST  a JPEG (the app re-encodes whatever was picked or pasted), from an RST contributor
//         (can_file_hubstaff()). Uploaded to the "hubstaff" folder and recorded in
//         hubstaff_screenshot_uploads, which file_hubstaff_hours() checks. Returns { ref }.
//   GET   ?ref=<id>, for whoever can read the entry: can_view_hubstaff_screenshot().
// Kept free of Vercel and browser APIs so it can be tested with a fake fetch (hence the .js imports).

import { serverSupabaseConfig as config, signedInCaller, type ServerSupabaseEnv } from './serverAuth.js'
import { downloadFromDrive, driveConfigured, uploadToDrive, type DriveEnv } from './googleDrive.js'

export interface HubstaffScreenshotEnv extends DriveEnv, ServerSupabaseEnv {}

export const MAX_HUBSTAFF_SCREENSHOT_BYTES = 1536 * 1024
const MIN_SCREENSHOT_BYTES = 512
export const MAX_HUBSTAFF_SCREENSHOTS_PER_DAY = 20
const DRIVE_FOLDER = 'hubstaff'

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (status: number, message: string) => json(status, { message })

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

async function callerRpc(env: HubstaffScreenshotEnv, token: string, name: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<boolean> {
  const { url, anonKey } = config(env)
  const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.ok ? (await response.json()) === true : false
}

export async function handleUploadHubstaffScreenshot(
  request: Request,
  env: HubstaffScreenshotEnv,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Response> {
  const { url, serviceKey } = config(env)
  if (!serviceKey || !driveConfigured(env)) {
    console.error('api/hubstaff-screenshot: SUPABASE_SERVICE_ROLE_KEY or the Google Drive settings are not set.')
    return refuse(500, "Screenshots can't be saved right now. Please try again later.")
  }

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again to add your screenshot.')
  if (!(await callerRpc(env, caller.token, 'can_file_hubstaff', {}, fetchImpl))) {
    return refuse(403, 'Hubstaff hours are for RST contributors.')
  }

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length > MAX_HUBSTAFF_SCREENSHOT_BYTES) return refuse(413, 'That screenshot is too large. Try a smaller one.')
  if (bytes.length < MIN_SCREENSHOT_BYTES || !isJpeg(bytes)) return refuse(400, 'That screenshot could not be read. Try another image.')

  const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const countResponse = await fetchImpl(
    `${url}/rest/v1/hubstaff_screenshot_uploads?user_id=eq.${caller.id}&created_at=gte.${encodeURIComponent(since)}&select=id`,
    { method: 'HEAD', headers: { ...serviceHeaders, Prefer: 'count=exact' } },
  )
  const uploadedToday = Number(countResponse.headers.get('content-range')?.split('/')[1] ?? 0)
  if (uploadedToday >= MAX_HUBSTAFF_SCREENSHOTS_PER_DAY) return refuse(429, "You've added a lot of screenshots today. Please try again tomorrow.")

  let fileId: string
  try {
    fileId = await uploadToDrive(
      env,
      {
        name: `${now.toISOString().replace(/[:.]/g, '-')} ${caller.email || caller.id}.jpg`,
        mimeType: 'image/jpeg',
        data: bytes,
        description: `Hubstaff screenshot, ${caller.email} (${caller.id})`,
        folder: DRIVE_FOLDER,
      },
      fetchImpl,
    )
  } catch (error) {
    console.error('api/hubstaff-screenshot: upload failed:', error)
    return refuse(502, "Your screenshot couldn't be saved just now. Please try again.")
  }

  const recordResponse = await fetchImpl(`${url}/rest/v1/hubstaff_screenshot_uploads`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: caller.id, drive_file_id: fileId }),
  })
  if (!recordResponse.ok) {
    console.error('api/hubstaff-screenshot: recording the upload failed:', recordResponse.status, await recordResponse.text().catch(() => ''))
    return refuse(500, "Your screenshot couldn't be saved just now. Please try again.")
  }
  return json(200, { ref: fileId })
}

export async function handleViewHubstaffScreenshot(request: Request, env: HubstaffScreenshotEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!driveConfigured(env)) return refuse(500, "Screenshots can't be shown right now.")
  const ref = new URL(request.url).searchParams.get('ref') ?? ''
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(ref)) return refuse(400, 'Not a screenshot.')

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again to see this screenshot.')
  if (!(await callerRpc(env, caller.token, 'can_view_hubstaff_screenshot', { p_ref: ref }, fetchImpl))) {
    return refuse(404, 'Screenshot not found.')
  }

  let image: Response | null
  try {
    image = await downloadFromDrive(env, ref, fetchImpl)
  } catch (error) {
    console.error('api/hubstaff-screenshot: download failed:', error)
    return refuse(502, "This screenshot couldn't be loaded just now.")
  }
  if (!image) return refuse(404, 'This screenshot is no longer in Google Drive.')
  return new Response(image.body, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable' },
  })
}
