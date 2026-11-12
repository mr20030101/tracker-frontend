import { describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ supabase: {} }))

import { activePlaces, deviceLabel, type UserSession } from './sessionDevices'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const EDGE_WIN = `${CHROME_WIN} Edg/130.0.0.0`
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0'

describe('deviceLabel', () => {
  it('names the browser and system', () => {
    expect(deviceLabel(CHROME_WIN)).toBe('Chrome on Windows')
    expect(deviceLabel(EDGE_WIN)).toBe('Edge on Windows')
    expect(deviceLabel(SAFARI_IPHONE)).toBe('Safari on iPhone')
    expect(deviceLabel(CHROME_ANDROID)).toBe('Chrome on Android')
    expect(deviceLabel(FIREFOX_MAC)).toBe('Firefox on Mac')
  })

  it('handles a missing user agent', () => {
    expect(deviceLabel(null)).toBe('Unknown device')
    expect(deviceLabel('')).toBe('Unknown device')
  })
})

describe('activePlaces', () => {
  const now = new Date('2026-11-13T10:00:00Z').getTime()
  const session = (overrides: Partial<UserSession>): UserSession => ({
    session_id: Math.random().toString(),
    device: 'Chrome on Windows',
    user_agent: CHROME_WIN,
    sign_in_ip: '1.1.1.1',
    last_ip: '1.1.1.1',
    signed_in_at: '2026-11-13T08:00:00Z',
    last_active: '2026-11-13T09:58:00Z',
    via_link: false,
    is_new_device: false,
    ...overrides,
  })

  it('counts distinct device and IP pairs active in the last 6 minutes', () => {
    expect(activePlaces([session({}), session({ device: 'Safari on iPhone', last_ip: '2.2.2.2' })], now)).toBe(2)
  })

  it('counts two tabs on the same device and IP once', () => {
    expect(activePlaces([session({}), session({})], now)).toBe(1)
  })

  it('counts the same device from another IP as another place', () => {
    expect(activePlaces([session({}), session({ last_ip: '3.3.3.3' })], now)).toBe(2)
  })

  it('counts a session with no reported device by its user agent, as the card shows it', () => {
    expect(activePlaces([session({}), session({ device: null }), session({ device: 'Unknown device' })], now)).toBe(1)
  })

  it('leaves out idle sessions, the extension and link sign-ins', () => {
    expect(
      activePlaces(
        [
          session({}),
          session({ device: 'Safari on iPhone', last_active: '2026-11-13T09:40:00Z' }),
          session({ device: 'Browser extension', last_ip: '4.4.4.4' }),
          session({ device: 'Firefox on Mac', via_link: true }),
        ],
        now,
      ),
    ).toBe(1)
  })
})
