import { matchPath, useLocation } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'

// Speed Insights records the address of every page it measures. Some of ours carry
// someone's email or an id, so it is given the route pattern instead ("/contributors/:email"
// rather than "/contributors/jane@example.com"), which also groups those pages together.
const ROUTE_PATTERNS = ['/messages/:userId', '/contributors/:email', '/leads/:leadId', '/apply/:leadId']

const routeOf = (pathname: string) => ROUTE_PATTERNS.find((pattern) => matchPath(pattern, pathname)) ?? pathname

// Only the site and the route pattern are sent: no email or id in the path, and no query string or hash.
function scrub(event: { type: 'vital'; url: string; route?: string }) {
  try {
    const url = new URL(event.url)
    return { ...event, url: `${url.origin}${routeOf(url.pathname)}` }
  } catch {
    return null
  }
}

// The measuring script only exists on Vercel, so it is skipped in local development.
export function SpeedInsightsTracker() {
  const { pathname } = useLocation()
  if (!import.meta.env.PROD) return null
  return <SpeedInsights route={routeOf(pathname)} beforeSend={scrub} />
}
