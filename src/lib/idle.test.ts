// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IDLE_AFTER_MS, isIdle, liveChannelName, startIdleWatch } from './idle'

describe('isIdle', () => {
  it('turns idle once the full quiet period has passed', () => {
    expect(isIdle(0, IDLE_AFTER_MS - 1)).toBe(false)
    expect(isIdle(0, IDLE_AFTER_MS)).toBe(true)
  })
})

describe('liveChannelName', () => {
  it('gives every subscription its own topic', () => {
    expect(liveChannelName('feed')).not.toBe(liveChannelName('feed'))
    expect(liveChannelName('feed')).toMatch(/^feed-/)
  })
})

describe('startIdleWatch', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    startIdleWatch()
  })
  afterAll(() => vi.useRealTimers())

  it('pauses React Query after 10 quiet minutes and wakes on the next input', () => {
    expect(focusManager.isFocused()).toBe(true)
    vi.advanceTimersByTime(IDLE_AFTER_MS + 30_000)
    expect(focusManager.isFocused()).toBe(false)
    window.dispatchEvent(new Event('keydown'))
    expect(focusManager.isFocused()).toBe(true)
  })
})
