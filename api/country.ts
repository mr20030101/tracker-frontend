// Vercel Function: tells the Apply page which country the visitor is in, from the
// x-vercel-ip-country header Vercel adds to every request (a two-letter code such as "PH").
// Based on the IP address, so a VPN can get around it. Null outside Vercel (e.g. `npm run dev`).
// The Cloudflare Pages twin is functions/api/country.ts.
// The .js extension is required: see api/apply.ts.
import { requestCountry } from '../src/lib/host.js'

export function GET(request: Request): Response {
  return Response.json({ country: requestCountry(request) }, { headers: { 'Cache-Control': 'no-store' } })
}
