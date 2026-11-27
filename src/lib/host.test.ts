import { describe, expect, it } from 'vitest'
import { requestCountry, requestIp, servedByCloudflare } from './host'

const vercelRequest = (headers: Record<string, string>) => new Request('https://tracker.example/api/x', { headers })

// Cloudflare's runtime attaches `cf` to the incoming Request; a plain Request gets it added here.
const cloudflareRequest = (cf: Record<string, unknown>, headers: Record<string, string> = {}) =>
  Object.assign(new Request('https://tracker.example/api/x', { headers }), { cf })

describe('requestCountry', () => {
  it("reads Vercel's header on Vercel", () => {
    expect(requestCountry(vercelRequest({ 'x-vercel-ip-country': 'ph' }))).toBe('PH')
  })

  it("reads Cloudflare's request.cf on Cloudflare", () => {
    expect(requestCountry(cloudflareRequest({ country: 'PH' }))).toBe('PH')
  })

  it("ignores a cf-ipcountry header sent to Vercel, which a visitor can set themselves", () => {
    expect(requestCountry(vercelRequest({ 'cf-ipcountry': 'PH' }))).toBeNull()
  })

  it("ignores an x-vercel-ip-country header sent to Cloudflare, which a visitor can set themselves", () => {
    expect(requestCountry(cloudflareRequest({ country: 'US' }, { 'x-vercel-ip-country': 'PH' }))).toBe('US')
  })

  it("treats Cloudflare's XX as unknown", () => {
    expect(requestCountry(cloudflareRequest({ country: 'XX' }))).toBeNull()
  })

  it('is null when the host says nothing', () => {
    expect(requestCountry(vercelRequest({}))).toBeNull()
    expect(requestCountry(cloudflareRequest({}))).toBeNull()
  })
})

describe('requestIp', () => {
  it('takes the first x-forwarded-for address on Vercel', () => {
    expect(requestIp(vercelRequest({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
  })

  it('takes cf-connecting-ip on Cloudflare, not a forwarded-for chain the visitor could start', () => {
    expect(requestIp(cloudflareRequest({}, { 'cf-connecting-ip': '5.6.7.8', 'x-forwarded-for': '9.9.9.9' }))).toBe('5.6.7.8')
  })
})

describe('servedByCloudflare', () => {
  it('is only true for a request carrying cf', () => {
    expect(servedByCloudflare(cloudflareRequest({}))).toBe(true)
    expect(servedByCloudflare(vercelRequest({ 'cf-ipcountry': 'PH' }))).toBe(false)
  })
})
