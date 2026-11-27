// The headers vercel.json gives every response. On Cloudflare, public/_headers covers the static
// files but not Functions, so the API's answers get them here. It lives under api/ on purpose: a
// middleware at the top of functions/ would run a Function for every page and file, and each run
// counts toward the free plan's daily limit.
export async function onRequest({ next }: { next: () => Promise<Response> }): Promise<Response> {
  const response = await next()
  // A copy, since a Response passed through from fetch() has read-only headers.
  const copy = new Response(response.body, response)
  copy.headers.set('X-Content-Type-Options', 'nosniff')
  copy.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  copy.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return copy
}
