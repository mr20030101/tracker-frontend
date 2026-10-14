import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from './api'

const { mockGetUser, mockOrder } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockOrder: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => {
  const makeBuilder = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      },
    }
    b.select = () => b
    b.eq = () => b
    b.or = () => b
    b.gte = () => b
    b.lte = () => b
    b.order = (col: string, opts: object) => {
      if (table === 'task_submissions') mockOrder(col, opts)
      return b
    }
    b.range = () => Promise.resolve({ data: [], error: null, count: 0 })
    b.maybeSingle = () =>
      Promise.resolve({
        data: { id: 'u1', role: 'admin', is_active: true, email: 'admin@test.com' },
        error: null,
      })
    return b
  }

  return {
    createClient: vi.fn(() => ({
      auth: { getUser: mockGetUser },
      from: (table: string) => makeBuilder(table),
    })),
  }
})

describe('submissions() paging order stability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  })

  it('appends id as ascending tie-breaker when sorting ascending', async () => {
    await api.get('/task-submissions', { params: { sort: 'date', sort_dir: 'asc' } })
    expect(mockOrder.mock.calls).toEqual([
      ['date', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  it('appends id as descending tie-breaker when sorting descending', async () => {
    await api.get('/task-submissions', { params: { sort: 'status', sort_dir: 'desc' } })
    expect(mockOrder.mock.calls).toEqual([
      ['status', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('appends id as descending tie-breaker when no direction is given', async () => {
    await api.get('/task-submissions', { params: { sort: 'stage' } })
    expect(mockOrder.mock.calls).toEqual([
      ['stage', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })
})
