// Cloudflare Pages Function: same as api/country.ts on Vercel, from the country Cloudflare
// attaches to the request (see src/lib/host.ts).
import { requestCountry, type PagesContext } from '../../src/lib/host.js'

export const onRequestGet = ({ request }: PagesContext) =>
  Response.json({ country: requestCountry(request) }, { headers: { 'Cache-Control': 'no-store' } })
