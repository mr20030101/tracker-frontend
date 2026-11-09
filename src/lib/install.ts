import { useSyncExternalStore } from 'react'

// Installing the tracker as an app. Chrome, Edge and Android browsers fire beforeinstallprompt when
// the app can be installed; it's kept here so the account menu can offer "Install app" later.
// iPhone and iPad Safari have no such prompt: there it's Share → Add to Home Screen, by hand.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone or iPad Safari, not yet opened from the home screen: install by hand. */
export const isIosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()

export function startInstallListener() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

/** Shows the browser's own install prompt. Returns whether the person installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  await event.prompt()
  const { outcome } = await event.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the browser can install the app right now (false once installed or opened as the app). */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, () => Boolean(deferred) && !isStandalone())
}
