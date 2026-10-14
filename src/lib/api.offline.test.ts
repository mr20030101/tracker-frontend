import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isNetworkError } from './offlineQueue'
import { api } from './api'

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  })),
}))

describe('currentProfile: auth errors on a flaky network', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rethrows the auth error when getUser returns a network failure, not Unauthenticated', async () => {
    const networkError = Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: networkError })

    const caught = await api.get('/me').catch((e: unknown) => e)

    expect(caught).toBe(networkError)
    expect(isNetworkError(caught)).toBe(true)
  })

  it('throws Unauthenticated when there is no user and no auth error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const caught = await api.get('/me').catch((e: unknown) => e)

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('Unauthenticated')
    expect(isNetworkError(caught)).toBe(false)
  })
})
