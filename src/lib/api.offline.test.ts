import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isNetworkError } from './offlineQueue'
import { api } from './api'

const { mockGetSession, mockMaybeSingle } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getSession: mockGetSession },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  })),
}))

describe('currentProfile on a flaky network', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports a lost connection while reading the profile as a network error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })

    const caught = await api.get('/me').catch((e: unknown) => e)

    expect(caught).toBeInstanceOf(Error)
    expect(isNetworkError(caught)).toBe(true)
  })

  it('throws Unauthenticated when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    const caught = await api.get('/me').catch((e: unknown) => e)

    expect((caught as Error).message).toBe('Unauthenticated')
    expect(isNetworkError(caught)).toBe(false)
    expect(mockMaybeSingle).not.toHaveBeenCalled()
  })
})
