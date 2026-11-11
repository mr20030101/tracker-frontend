import { describe, expect, it, vi } from 'vitest'
import { handleLoginAs } from './loginAsGate'

const ENV = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' }
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function fakeFetch({
  callerRole = 'admin',
  target = { role: 'contributor', is_active: true, must_change_password: false } as Partial<{ role: string; is_active: boolean; must_change_password: boolean }> | null,
  signedIn = true,
  auditOk = true,
} = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return signedIn ? Response.json({ id: ADMIN, email: 'admin@example.com' }) : new Response(null, { status: 401 })
    if (url.includes('/rest/v1/profiles?id=eq.')) return Response.json([{ is_active: true, must_change_password: false }])
    if (url.includes('/rest/v1/profiles?id=in.')) {
      const rows = [{ id: ADMIN, name: 'Admin', email: 'admin@example.com', role: callerRole, is_active: true, must_change_password: false }]
      if (target) rows.push({ id: CB, name: 'Jane CB', email: 'jane@example.com', role: 'contributor', is_active: true, must_change_password: false, ...target })
      return Response.json(rows)
    }
    if (url.endsWith('/auth/v1/admin/generate_link')) return Response.json({ hashed_token: 'hash123', verification_type: 'magiclink' })
    if (url.endsWith('/rest/v1/audit_logs') && init?.method === 'POST') return new Response(null, { status: auditOk ? 201 : 500 })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

const request = (body: unknown = { user_id: CB }) =>
  new Request('https://tracker.example/api/login-as', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const called = (fetchImpl: ReturnType<typeof fakeFetch>, part: string) => fetchImpl.mock.calls.find(([url]) => String(url).includes(part))

describe('handleLoginAs', () => {
  it("gives an admin a one-time token for a CB, and logs it first", async () => {
    const fetchImpl = fakeFetch()
    const response = await handleLoginAs(request(), ENV, fetchImpl)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ token_hash: 'hash123', type: 'magiclink', name: 'Jane CB' })
    expect(JSON.parse(String(called(fetchImpl, '/admin/generate_link')?.[1]?.body))).toEqual({ type: 'magiclink', email: 'jane@example.com' })
    const audit = JSON.parse(String(called(fetchImpl, '/rest/v1/audit_logs')?.[1]?.body))
    expect(audit).toMatchObject({ actor_id: ADMIN, action: 'logged_in_as', target_user_id: CB })
  })

  it('refuses anyone who is not an admin', async () => {
    for (const role of ['lead', 'contributor']) {
      const fetchImpl = fakeFetch({ callerRole: role })
      expect((await handleLoginAs(request(), ENV, fetchImpl)).status).toBe(403)
      expect(called(fetchImpl, '/admin/generate_link')).toBeUndefined()
    }
  })

  it('refuses a caller who is not signed in', async () => {
    const fetchImpl = fakeFetch({ signedIn: false })
    expect((await handleLoginAs(request(), ENV, fetchImpl)).status).toBe(401)
    expect(called(fetchImpl, '/admin/generate_link')).toBeUndefined()
  })

  it('never logs in as another admin, a disabled account or one still on a temporary password', async () => {
    for (const target of [{ role: 'admin' }, { is_active: false }, { must_change_password: true }]) {
      const fetchImpl = fakeFetch({ target })
      expect((await handleLoginAs(request(), ENV, fetchImpl)).status).toBeGreaterThanOrEqual(400)
      expect(called(fetchImpl, '/admin/generate_link')).toBeUndefined()
    }
  })

  it('rejects a bad or missing id, and yourself', async () => {
    for (const body of [{}, { user_id: 'nope' }, { user_id: `${CB},${ADMIN}` }, { user_id: ADMIN }]) {
      const fetchImpl = fakeFetch()
      expect((await handleLoginAs(request(body), ENV, fetchImpl)).status).toBe(400)
      expect(called(fetchImpl, '/admin/generate_link')).toBeUndefined()
    }
  })

  it("hands over no token when the Activity Log can't be written", async () => {
    const response = await handleLoginAs(request(), ENV, fakeFetch({ auditOk: false }))
    expect(response.status).toBe(500)
    expect(await response.json()).not.toHaveProperty('token_hash')
  })
})
