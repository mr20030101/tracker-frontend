// Vercel Function: tells the Apply page which country the visitor is in, from the
// x-vercel-ip-country header Vercel adds to every request (a two-letter code such as "PH").
// Based on the IP address, so a VPN can get around it. Null outside Vercel (e.g. `npm run dev`).
export function GET(request: Request): Response {
  const country = request.headers.get('x-vercel-ip-country')
  return Response.json({ country: country ? country.toUpperCase() : null }, { headers: { 'Cache-Control': 'no-store' } })
}
