// What differs between the two hosts the server code runs on: Vercel Functions (api/*) and
// Cloudflare Pages Functions (functions/api/*). Both hand the same handlers a standard Request and
// an env object; only where the visitor's country and address come from differs.
//
// Each host's own value is the only one trusted. Vercel overwrites x-vercel-* headers but passes a
// visitor's cf-ipcountry through untouched, and Cloudflare does the reverse, so reading "whichever
// header is there" would let anyone pick their own country.

/** What Cloudflare Pages passes a function (only the parts these functions use). */
export interface PagesContext {
  request: Request
  env: Record<string, string | undefined>
}

// Cloudflare's runtime attaches `cf` (country, city, ...) to every incoming Request. A visitor
// can't set it, and it's absent on Vercel, in tests and in the browser.
type CloudflareRequest = Request & { cf?: { country?: unknown } }

export function servedByCloudflare(request: Request): boolean {
  return Boolean((request as CloudflareRequest).cf)
}

/** The visitor's two-letter country code (e.g. "PH"), or null when the host doesn't know it. */
export function requestCountry(request: Request): string | null {
  const raw = servedByCloudflare(request)
    ? (request as CloudflareRequest).cf?.country
    : request.headers.get('x-vercel-ip-country')
  const country = typeof raw === 'string' && raw ? raw.toUpperCase() : null
  // "XX" is Cloudflare's "no country for this address".
  return country === 'XX' ? null : country
}

/** The visitor's IP address, or null when the host didn't say. */
export function requestIp(request: Request): string | null {
  const ip = servedByCloudflare(request)
    ? request.headers.get('cf-connecting-ip')
    : request.headers.get('x-forwarded-for')?.split(',')[0]
  return ip?.trim() || null
}
