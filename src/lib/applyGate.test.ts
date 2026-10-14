import { describe, expect, it, vi } from 'vitest'
import { handleApply, type ApplyGateEnv } from './applyGate'

const ENV: ApplyGateEnv = {
  TURNSTILE_SECRET_KEY: 'secret',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  VERCEL: '1',
}

const APPLICATION = {
  lead_id: 'lead-1',
  turnstile_token: 'token',
  full_name: 'Juan Dela Cruz',
  active_email: 'juan@example.com',
  facebook_url: 'https://facebook.com/juan',
  has_robotics_background: false,
  has_personal_computer: true,
  has_stable_internet: true,
}

function request(body: unknown, { country = 'PH', method = 'POST' }: { country?: string | null; method?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })
  if (country) headers.set('x-vercel-ip-country', country)
  return new Request('https://tracker.example/api/apply', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

// A fetch that answers Turnstile with `turnstile` and the RPC with `rpc`, recording the calls.
function fakeFetch({ turnstile = { success: true }, rpc = { status: 204, body: '' } } = {}) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url).includes('challenges.cloudflare.com')) return new Response(JSON.stringify(turnstile))
    return new Response(rpc.body || null, { status: rpc.status })
  })
}

describe('handleApply', () => {
  it('saves an application from the Philippines with a valid Turnstile token', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleApply(request({ ...APPLICATION, sneaky: 'dropped' }), ENV, fetchImpl)
    expect(response.status).toBe(200)

    const [verifyUrl, verifyInit] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(verifyUrl).toContain('challenges.cloudflare.com')
    const verifyBody = verifyInit.body as URLSearchParams
    expect(verifyBody.get('secret')).toBe('secret')
    expect(verifyBody.get('response')).toBe('token')
    expect(verifyBody.get('remoteip')).toBe('1.2.3.4')

    const [rpcUrl, rpcInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(rpcUrl).toBe('https://project.supabase.co/rest/v1/rpc/submit_hiring_application')
    expect((rpcInit.headers as Record<string, string>).Authorization).toBe('Bearer service-key')
    const sent = JSON.parse(rpcInit.body as string)
    expect(sent.p_lead_id).toBe('lead-1')
    expect(sent.p_full_name).toBe('Juan Dela Cruz')
    expect(sent.p_cpu).toBeNull()
    expect(sent).not.toHaveProperty('p_sneaky')
    expect(sent).not.toHaveProperty('p_turnstile_token')
  })

  it('refuses a visitor outside the Philippines without checking anything else', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleApply(request(APPLICATION, { country: 'us' }), ENV, fetchImpl)
    expect(response.status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a missing country on Vercel, but allows it in local dev', async () => {
    expect((await handleApply(request(APPLICATION, { country: null }), ENV, fakeFetch())).status).toBe(403)
    expect((await handleApply(request(APPLICATION, { country: null }), { ...ENV, VERCEL: undefined }, fakeFetch())).status).toBe(200)
  })

  it('refuses a request with no Turnstile token', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleApply(request({ ...APPLICATION, turnstile_token: '' }), ENV, fetchImpl)
    expect(response.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a token Turnstile rejects, and never reaches the database', async () => {
    const fetchImpl = fakeFetch({ turnstile: { success: false } })
    const response = await handleApply(request(APPLICATION), ENV, fetchImpl)
    expect(response.status).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("passes the database's own message on when it refuses the application", async () => {
    const fetchImpl = fakeFetch({ rpc: { status: 400, body: JSON.stringify({ message: 'An application with this email has already been submitted.' }) } })
    const response = await handleApply(request(APPLICATION), ENV, fetchImpl)
    expect(response.status).toBe(400)
    expect(((await response.json()) as { message: string }).message).toBe('An application with this email has already been submitted.')
  })

  it('fails closed when a secret is missing', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleApply(request(APPLICATION), { ...ENV, TURNSTILE_SECRET_KEY: undefined }, fetchImpl)
    expect(response.status).toBe(500)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('only accepts POST', async () => {
    expect((await handleApply(request(null, { method: 'GET' }), ENV, fakeFetch())).status).toBe(405)
  })
})
