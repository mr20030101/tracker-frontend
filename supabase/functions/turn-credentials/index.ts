import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Short-lived TURN relay credentials for the Office page's voice calls (src/lib/voice.ts), from
// Cloudflare Realtime TURN. Cloudflare hands out credentials per request rather than a fixed
// password, so the TURN key's API token stays here as a secret and signed-in users get a fresh
// set (valid for a day) whenever they join voice.
//
// Secrets: CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN (Cloudflare dashboard → Realtime →
// TURN Server → your key).

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TTL_SECONDS = 24 * 60 * 60

function errorResponse(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: corsHeaders })
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        return await handle(request)
    } catch (err) {
        // Keeps the CORS headers on unexpected errors, so the browser shows the real message
        // instead of an opaque CORS failure.
        const message = err instanceof Error ? err.message : String(err)
        return errorResponse(`Unexpected error: ${message}`, 500)
    }
})

async function handle(request: Request): Promise<Response> {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const turnKeyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID')
    const turnApiToken = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN')
    if (!supabaseUrl || !serviceKey) return errorResponse('Supabase service configuration is missing.', 500)
    if (!turnKeyId || !turnApiToken) return errorResponse('Cloudflare TURN is not configured.', 500)

    // Only signed-in users get relay credentials, so the relay can't be used by anyone on the web.
    const admin = createClient(supabaseUrl, serviceKey)
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return errorResponse('Unauthorized: missing access token.', 401)
    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return errorResponse('Unauthorized: invalid access token.', 401)

    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${turnKeyId}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${turnApiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
    })
    if (!response.ok) {
        return errorResponse(`Cloudflare TURN request failed (${response.status}): ${await response.text()}`, 502)
    }
    const body = await response.json()
    // Cloudflare returns a list of ICE servers (an older endpoint returned a single object).
    const iceServers = (Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers])
        .filter(Boolean)
        .map((server: { urls: string | string[]; username?: string; credential?: string }) => ({
            ...server,
            // Port 53 (DNS) is blocked by some browsers and networks; skipping it avoids slow timeouts.
            urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(\?|$)/.test(url)),
        }))
        .filter((server: { urls: string[] }) => server.urls.length > 0)

    return Response.json({ iceServers, ttl: TTL_SECONDS }, { headers: corsHeaders })
}
