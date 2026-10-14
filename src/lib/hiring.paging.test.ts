import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchApplications } from './hiring'

const { mockRange } = vi.hoisted(() => ({
  mockRange: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeBuilder = (): any => {
    const b: Record<string, unknown> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.select = (): any => b
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.order = (): any => b
    b.range = (from: number, to: number) => mockRange(from, to)
    return b
  }
  return {
    createClient: vi.fn(() => ({
      auth: { getUser: vi.fn() },
      from: () => makeBuilder(),
    })),
  }
})

function makeRows(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    created_at: '2024-01-01T00:00:00Z',
  }))
}

describe('fetchApplications paging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches all pages when results exceed 1000 rows', async () => {
    const page1 = makeRows(1000, 1)
    const page2 = makeRows(42, 1001)
    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })

    const result = await fetchApplications()

    expect(result).toHaveLength(1042)
    expect(mockRange).toHaveBeenCalledTimes(2)
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999)
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('returns all rows when under 1000', async () => {
    mockRange.mockResolvedValueOnce({ data: makeRows(5), error: null })

    const result = await fetchApplications()

    expect(result).toHaveLength(5)
    expect(mockRange).toHaveBeenCalledTimes(1)
  })
})
