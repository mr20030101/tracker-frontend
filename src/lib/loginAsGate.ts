// Server side of "Log in as", run by the Vercel Function in api/login-as.ts. An admin asks to be
// signed in as a lead or contributor: this checks the caller is an active admin and the person isn't
// an admin, records it in the Activity Log, and hands back a one-time sign-in token for that person
// (Supabase's admin generate_link; no email is sent). The browser exchanges it for their session
// (see loginAs.ts). Kept free of Vercel and browser APIs so it can be tested with a fake fetch.

import { serverSupabaseConfig, signedInCaller, type ServerSupabaseEnv } from './serverAuth.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Profile {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  must_change_password: boolean
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function handleLoginAs(request: Request, env: ServerSupabaseEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const { url, serviceKey } = serverSupabaseConfig(env)
  if (!serviceKey) {
    console.error('api/login-as: SUPABASE_SERVICE_ROLE_KEY is not set.')
    return json(500, { message: 'Not set up.' })
  }
  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return json(401, { message: 'Sign in again.' })

  const input = (await request.json().catch(() => null)) as { user_id?: unknown } | null
  const userId = typeof input?.user_id === 'string' && UUID.test(input.user_id) ? input.user_id : null
  if (!userId) return json(400, { message: 'Who?' })
  if (userId === caller.id) return json(400, { message: "That's you." })

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  try {
    const profilesResponse = await fetchImpl(
      `${url}/rest/v1/profiles?id=in.(${caller.id},${userId})&select=id,name,email,role,is_active,must_change_password`,
      { headers },
    )
    if (!profilesResponse.ok) throw new Error(`Reading profiles failed (${profilesResponse.status}).`)
    const profiles = (await profilesResponse.json()) as Profile[]
    const me = profiles.find((p) => p.id === caller.id)
    const target = profiles.find((p) => p.id === userId)

    if (me?.role !== 'admin' || !me.is_active) return json(403, { message: 'Only admins can log in as someone else.' })
    if (!target) return json(404, { message: 'That account was not found.' })
    if (target.role === 'admin') return json(403, { message: "You can't log in as another admin." })
    if (!target.is_active) return json(400, { message: `${target.name}'s account is disabled. Enable it first.` })
    if (target.must_change_password) {
      return json(400, { message: `${target.name} has to set their own password first, so they can't be logged in as yet.` })
    }

    const linkResponse = await fetchImpl(`${url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: target.email }),
    })
    if (!linkResponse.ok) throw new Error(`Making the sign-in link failed (${linkResponse.status}): ${(await linkResponse.text()).slice(0, 200)}`)
    const link = (await linkResponse.json()) as { hashed_token?: string; verification_type?: string }
    if (!link.hashed_token) throw new Error('The sign-in link came back without a token.')

    // Recorded before the token is handed over, so no use of it goes unlogged.
    const auditResponse = await fetchImpl(`${url}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_id: caller.id,
        action: 'logged_in_as',
        target_user_id: target.id,
        summary: `Logged in as ${target.name} (${target.role === 'lead' ? 'lead' : 'CB'})`.slice(0, 500),
        details: { role: target.role },
      }),
    })
    if (!auditResponse.ok) throw new Error(`Writing the Activity Log failed (${auditResponse.status}).`)

    return json(200, { token_hash: link.hashed_token, type: link.verification_type ?? 'magiclink', name: target.name })
  } catch (err) {
    console.error('api/login-as:', err)
    return json(500, { message: "Couldn't log in as them. Try again." })
  }
}
