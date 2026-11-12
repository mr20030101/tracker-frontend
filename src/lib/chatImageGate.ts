// Server side of photos in chat, run by the Vercel Function in api/chat-image.ts (same shape as
// the Support upload gate). The images live in Google Drive (see googleDrive.ts), never in Supabase:
//   POST  a JPEG (the app re-encodes whatever was picked or pasted), from anyone signed in.
//         Uploaded to the "chat" folder and recorded in chat_image_uploads, which the message
//         insert policies check. Returns { ref }, the Drive file id the message carries.
//   GET   ?ref=<id>, for the uploader or anyone in a chat that carries it: can_view_chat_image().
// Kept free of Vercel and browser APIs so it can be tested with a fake fetch (hence the .js imports).

import { serverSupabaseConfig as config, signedInCaller, type ServerSupabaseEnv } from './serverAuth.js'
import { downloadFromDrive, driveConfigured, uploadToDrive, type DriveEnv } from './googleDrive.js'

export interface ChatImageEnv extends DriveEnv, ServerSupabaseEnv {}

export const MAX_CHAT_IMAGE_BYTES = 1536 * 1024
const MIN_CHAT_IMAGE_BYTES = 512
export const MAX_CHAT_IMAGES_PER_DAY = 100
const DRIVE_FOLDER = 'chat'

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (status: number, message: string) => json(status, { message })

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

export async function handleUploadChatImage(
  request: Request,
  env: ChatImageEnv,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Response> {
  const { url, serviceKey } = config(env)
  if (!serviceKey || !driveConfigured(env)) {
    console.error('api/chat-image: SUPABASE_SERVICE_ROLE_KEY or the Google Drive settings are not set.')
    return refuse(500, "Photos can't be sent right now. You can still send a text message.")
  }

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again to send a photo.')

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length > MAX_CHAT_IMAGE_BYTES) return refuse(413, 'That photo is too large. Try a smaller one.')
  if (bytes.length < MIN_CHAT_IMAGE_BYTES || !isJpeg(bytes)) return refuse(400, 'That photo could not be read. Try another image.')

  const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const countResponse = await fetchImpl(
    `${url}/rest/v1/chat_image_uploads?user_id=eq.${caller.id}&created_at=gte.${encodeURIComponent(since)}&select=id`,
    { method: 'HEAD', headers: { ...serviceHeaders, Prefer: 'count=exact' } },
  )
  const uploadedToday = Number(countResponse.headers.get('content-range')?.split('/')[1] ?? 0)
  if (uploadedToday >= MAX_CHAT_IMAGES_PER_DAY) return refuse(429, "You've sent a lot of photos today. Please try again tomorrow.")

  let fileId: string
  try {
    fileId = await uploadToDrive(
      env,
      {
        name: `${now.toISOString().replace(/[:.]/g, '-')} ${caller.email || caller.id}.jpg`,
        mimeType: 'image/jpeg',
        data: bytes,
        description: `Chat photo, ${caller.email} (${caller.id})`,
        folder: DRIVE_FOLDER,
      },
      fetchImpl,
    )
  } catch (error) {
    console.error('api/chat-image: upload failed:', error)
    return refuse(502, "Your photo couldn't be saved just now. Please try again.")
  }

  const recordResponse = await fetchImpl(`${url}/rest/v1/chat_image_uploads`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: caller.id, drive_file_id: fileId }),
  })
  if (!recordResponse.ok) {
    console.error('api/chat-image: recording the upload failed:', recordResponse.status, await recordResponse.text().catch(() => ''))
    return refuse(500, "Your photo couldn't be saved just now. Please try again.")
  }
  return json(200, { ref: fileId })
}

export async function handleViewChatImage(request: Request, env: ChatImageEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!driveConfigured(env)) return refuse(500, "Photos can't be shown right now.")
  const ref = new URL(request.url).searchParams.get('ref') ?? ''
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(ref)) return refuse(400, 'Not a photo.')

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again to see this photo.')

  const { url, anonKey } = config(env)
  const checkResponse = await fetchImpl(`${url}/rest/v1/rpc/can_view_chat_image`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${caller.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ref: ref }),
  })
  const allowed = checkResponse.ok ? (await checkResponse.json()) === true : false
  if (!allowed) return refuse(404, 'Photo not found.')

  let image: Response | null
  try {
    image = await downloadFromDrive(env, ref, fetchImpl)
  } catch (error) {
    console.error('api/chat-image: download failed:', error)
    return refuse(502, "This photo couldn't be loaded just now.")
  }
  if (!image) return refuse(404, 'This photo is no longer available.')
  return new Response(image.body, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable' },
  })
}
