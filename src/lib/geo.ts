// The visitor's country as a two-letter code (e.g. "PH"), from api/country.ts on Vercel.
// Null when it can't be told: running locally (no Vercel function, so the request gets the
// app's index.html back), a network error, or Vercel not knowing the address.
export async function fetchVisitorCountry(): Promise<string | null> {
  try {
    const response = await fetch('/api/country', { cache: 'no-store' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const body = (await response.json()) as { country?: unknown }
    return typeof body.country === 'string' && body.country ? body.country : null
  } catch {
    return null
  }
}
