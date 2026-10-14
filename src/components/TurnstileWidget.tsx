import { useEffect, useRef } from 'react'

// Cloudflare Turnstile's "are you human" check for the public Apply form. Most visitors never see a
// puzzle: it runs in the background and hands back a one-time token, which api/apply.ts verifies.
// The site key is public (it's in the page either way); the secret key lives only in Vercel.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface Turnstile {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let scriptLoading: Promise<Turnstile> | null = null

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load.')))
    script.onerror = () => {
      scriptLoading = null
      reject(new Error('Turnstile did not load.'))
    }
    document.head.appendChild(script)
  })
  return scriptLoading
}

/**
 * Renders the check and reports its token (null while there isn't a valid one). A token works once,
 * so bump `resetKey` after a failed submit to get a fresh one.
 */
export function TurnstileWidget({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    const container = containerRef.current
    if (!container || !SITE_KEY) return
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return
        widgetIdRef.current = turnstile.render(container, {
          sitekey: SITE_KEY,
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey === 0 || !widgetIdRef.current) return
    onTokenRef.current(null)
    window.turnstile?.reset(widgetIdRef.current)
  }, [resetKey])

  if (!SITE_KEY) return null
  return <div ref={containerRef} className="min-h-[65px]" />
}
