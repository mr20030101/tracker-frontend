import { useEffect } from 'react'

const APP_NAME = 'Tracker'
let current = APP_NAME

/** The current page's tab title, so something that briefly takes over the title (a ringing call) puts back the right one. */
export function pageTitle(): string {
  return current
}

/** Sets the browser tab title to "<title> | Tracker" while the page is open; no title shows just "Tracker". */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    current = title ? `${title} | ${APP_NAME}` : APP_NAME
    document.title = current
    return () => {
      current = APP_NAME
      document.title = APP_NAME
    }
  }, [title])
}
