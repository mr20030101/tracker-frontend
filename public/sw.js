// Makes the tracker installable as an app. Nothing is cached: every request goes to the network as
// usual, so a new release shows up straight away. Only when a page can't load at all (no connection)
// is a short offline notice shown instead of the browser's error page.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tracker</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f4f2ee;color:#32373f;text-align:center;padding:24px}
button{margin-top:16px;padding:10px 20px;border:0;border-radius:999px;background:#f2c64e;color:#32373f;font-weight:600;font-size:15px}</style></head>
<body><div><h1 style="font-size:22px;margin:0 0 8px">You're offline</h1><p style="margin:0;color:#6b7280">The tracker needs a connection. Check your internet, then try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
  )
})
