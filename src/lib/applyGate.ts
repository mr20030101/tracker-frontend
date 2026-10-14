// Server side of the public Apply form, run by the Vercel Function in api/apply.ts. The form used
// to call submit_hiring_application straight from the browser with the public anon key, so a
// script could skip both the Philippines-only rule (checked only in the page) and any bot check.
// Now the RPC is closed to anon, and only this gate calls it, with the service role key, after:
//   1. the visitor's country (x-vercel-ip-country, from their IP address) is the Philippines
//   2. Cloudflare Turnstile confirms the token the widget gave the page
// Kept free of Vercel and browser APIs so it can be tested with a fake fetch.

export const ELIGIBLE_COUNTRY = 'PH'
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface ApplyGateEnv {
  TURNSTILE_SECRET_KEY?: string
  SUPABASE_URL?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  /** Set to "1" by Vercel; without it (local dev) a missing country header is let through. */
  VERCEL?: string
}

// Only these reach the database, whatever else the request carries.
const APPLICATION_FIELDS = [
  'remotasks_email',
  'remotasks_id',
  'full_name',
  'active_email',
  'facebook_url',
  'has_robotics_background',
  'has_personal_computer',
  'has_stable_internet',
  'cpu',
  'gpu',
  'gpu_memory_gb',
] as const

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (status: number, message: string) => json(status, { message })

export async function handleApply(request: Request, env: ApplyGateEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return refuse(405, 'Method not allowed.')

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!env.TURNSTILE_SECRET_KEY || !supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('api/apply: TURNSTILE_SECRET_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.')
    return refuse(500, "Applications can't be received right now. Please try again later.")
  }

  const country = request.headers.get('x-vercel-ip-country')?.toUpperCase() ?? null
  if (country ? country !== ELIGIBLE_COUNTRY : env.VERCEL === '1') {
    return refuse(403, 'Sorry, this project is only open to applicants based in the Philippines.')
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return refuse(400, 'The application could not be read. Please try again.')
  }
  const leadId = typeof body.lead_id === 'string' ? body.lead_id : ''
  const token = typeof body.turnstile_token === 'string' ? body.turnstile_token : ''
  if (!leadId) return refuse(400, 'This application link is not valid.')
  if (!token) return refuse(400, 'Please complete the human check above the Submit button.')

  const verifyForm = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (ip) verifyForm.set('remoteip', ip)
  let verified = false
  try {
    const verifyResponse = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body: verifyForm })
    verified = Boolean(((await verifyResponse.json()) as { success?: boolean }).success)
  } catch (error) {
    console.error('api/apply: Turnstile verification failed:', error)
    return refuse(502, "We couldn't check the human check just now. Please try again.")
  }
  if (!verified) return refuse(403, 'The human check expired or failed. Please complete it again and resubmit.')

  const application = Object.fromEntries(APPLICATION_FIELDS.map((field) => [`p_${field}`, body[field] ?? null]))
  const rpcResponse = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/submit_hiring_application`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ p_lead_id: leadId, ...application }),
  })
  if (!rpcResponse.ok) {
    // The RPC's own messages ("Please answer every question.", "already been submitted", ...) are
    // written for the applicant, so they're passed on as they are.
    const detail = (await rpcResponse.json().catch(() => null)) as { message?: string } | null
    return refuse(400, detail?.message || 'Could not submit your application.')
  }
  return json(200, { ok: true })
}
