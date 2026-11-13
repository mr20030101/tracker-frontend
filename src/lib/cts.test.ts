import { describe, expect, it } from 'vitest'
import { goesToCts } from './cts'

describe('goesToCts', () => {
  it('takes finished tasks', () => {
    expect(goesToCts('submitted')).toBe(true)
    expect(goesToCts('claimed_by_another')).toBe(true)
  })

  it('leaves out in progress, empty, rejected/SBQ and expired tasks', () => {
    for (const status of ['in_progress', 'empty', 'rejected', 'expired'] as const) expect(goesToCts(status)).toBe(false)
  })
})
