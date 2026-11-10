import { focusManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

// A tab counts as idle after this long with no mouse, keyboard or touch input, or while hidden for
// as long. Idle tabs stop the background work that costs the database something for nobody: the
// presence ping, the live table feeds and the page polls (React Query treats the tab as unfocused).
// The first input or the tab being shown again wakes it, and stale data refreshes once.
export const IDLE_AFTER_MS = 10 * 60_000
const CHECK_EVERY_MS = 30_000
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

export function isIdle(lastActivity: number, now: number): boolean {
  return now - lastActivity >= IDLE_AFTER_MS
}

let lastActivity = Date.now()
let idle = false
const listeners = new Set<() => void>()

function setIdle(next: boolean) {
  if (next === idle) return
  idle = next
  listeners.forEach((listener) => listener())
}

function onActivity() {
  lastActivity = Date.now()
  setIdle(false)
}

function onVisibility() {
  if (document.visibilityState === 'visible') onActivity()
}

let started = false

/** Starts watching for activity, once, and makes React Query's "focused" mean visible and not idle. */
export function startIdleWatch() {
  if (started || typeof window === 'undefined') return
  started = true
  for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true, capture: true })
  document.addEventListener('visibilitychange', onVisibility)
  setInterval(() => setIdle(isIdle(lastActivity, Date.now())), CHECK_EVERY_MS)

  focusManager.setEventListener((setFocused) => {
    const update = () => setFocused(document.visibilityState === 'visible' && !idle)
    listeners.add(update)
    document.addEventListener('visibilitychange', update)
    return () => {
      listeners.delete(update)
      document.removeEventListener('visibilitychange', update)
    }
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** False while the tab is idle: pause background work (live feeds, heartbeats) until it's true again. */
export function useIsActive(): boolean {
  return !useSyncExternalStore(subscribe, () => idle, () => false)
}

// A fresh topic each time a subscription starts. supabase.channel() hands back an existing channel
// with the same name, and removeChannel() only drops one once it has finished leaving, so
// resubscribing straight after a cleanup used to get the old, closing channel back: no error, just
// no more events. That's how a lead missed the alarm for a new request. Pausing for idle
// resubscribes often, so every live feed needs this.
export function liveChannelName(name: string): string {
  return `${name}-${crypto.randomUUID()}`
}
