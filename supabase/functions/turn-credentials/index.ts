import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Short-lived TURN relay credentials for the Office page's voice calls (src/lib/voice.ts), from
// Cloudflare Realtime TURN. Cloudflare hands out credentials per request rather than a fixed
// password, so the TURN key's API token stays here as a secret and signed-in users get a fresh
// set (valid for a day) whenever they join voice.
//
// Secrets: CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN (Cloudflare dashboard → Realtime →
// TURN Server → your key).
//
// Usage cap: Cloudflare bills relay data sent to browsers (egress) past the first 1,000 GB a month.
// This function checks the account's egress for the current month (UTC) through Cloudflare's GraphQL
// Analytics API and stops handing out credentials once it reaches VOICE_RELAY_LIMIT_GB (980 by
// default), which pauses voice until the next month. Secrets: CLOUDFLARE_ACCOUNT_ID and
// CLOUDFLARE_ANALYTICS_API_TOKEN (a token with the "Account Analytics: Read" permission). Without
// them credentials are still given out, unmonitored, and the usage reports why.
//
// POST {"usageOnly": true} returns just the usage, for the Office page's voice panel.

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TTL_SECONDS = 24 * 60 * 60
const DEFAULT_LIMIT_GB = 980
// Analytics are checked at most this often per function instance; Cloudflare's own figures lag a
// few minutes anyway, which the 20 GB margin under the free 1,000 GB covers.
const USAGE_CACHE_MS = 5 * 60 * 1000

interface RelayUsage {
    // Relay data sent this month, in GB (10^9 bytes, as Cloudflare bills); null when unknown.
    usedGb: number | null
    limitGb: number
    paused: boolean
    // The month counted, as YYYY-MM (UTC).
    month: string
    // Why the usage is unknown (monitoring not set up, or the analytics request failed).
    error?: string
}

let cachedUsage: { usage: RelayUsage; at: number } | null = null

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

    const body = await request.json().catch(() => ({}))
    const usage = await relayUsage()
    if (body?.usageOnly) return Response.json({ usage }, { headers: corsHeaders })
    // Past the limit, nobody gets relay credentials, so no more billable relay data until next month.
    if (usage.paused) return Response.json({ iceServers: [], paused: true, usage }, { headers: corsHeaders })

    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${turnKeyId}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${turnApiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
    })
    if (!response.ok) {
        return errorResponse(`Cloudflare TURN request failed (${response.status}): ${await response.text()}`, 502)
    }
    const turn = await response.json()
    // Cloudflare returns a list of ICE servers (an older endpoint returned a single object).
    const iceServers = (Array.isArray(turn.iceServers) ? turn.iceServers : [turn.iceServers])
        .filter(Boolean)
        .map((server: { urls: string | string[]; username?: string; credential?: string }) => ({
            ...server,
            // Port 53 (DNS) is blocked by some browsers and networks; skipping it avoids slow timeouts.
            urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(\?|$)/.test(url)),
        }))
        .filter((server: { urls: string[] }) => server.urls.length > 0)

    return Response.json({ iceServers, ttl: TTL_SECONDS, paused: false, usage }, { headers: corsHeaders })
}

async function relayUsage(): Promise<RelayUsage> {
    if (cachedUsage && Date.now() - cachedUsage.at < USAGE_CACHE_MS) return cachedUsage.usage
    const usage = await fetchRelayUsage()
    // Failed checks aren't cached, so the next request tries again.
    if (usage.usedGb !== null) cachedUsage = { usage, at: Date.now() }
    return usage
}

async function fetchRelayUsage(): Promise<RelayUsage> {
    const limitGb = Number(Deno.env.get('VOICE_RELAY_LIMIT_GB')) || DEFAULT_LIMIT_GB
    const today = new Date().toISOString().slice(0, 10)
    const month = today.slice(0, 7)
    const unknown = (error: string): RelayUsage => ({ usedGb: null, limitGb, paused: false, month, error })

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
    const analyticsToken = Deno.env.get('CLOUDFLARE_ANALYTICS_API_TOKEN')
    if (!accountId || !analyticsToken) {
        return unknown('Not monitored: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_API_TOKEN.')
    }

    // The whole account's TURN egress (every key counts towards the free tier) from the 1st of the month.
    const query = `query ($accountId: string!, $dateFrom: Date!, $dateTo: Date!) {
        viewer {
            accounts(filter: { accountTag: $accountId }) {
                callsTurnUsageAdaptiveGroups(limit: 1, filter: { date_geq: $dateFrom, date_leq: $dateTo }) {
                    sum { egressBytes }
                }
            }
        }
    }`
    try {
        const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: { Authorization: `Bearer ${analyticsToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { accountId, dateFrom: `${month}-01`, dateTo: today } }),
        })
        const result = await response.json().catch(() => null)
        if (!response.ok || result?.errors?.length) {
            const reason = result?.errors?.[0]?.message ?? `HTTP ${response.status}`
            return unknown(`Couldn't read relay usage from Cloudflare: ${reason}`)
        }
        const accounts = result?.data?.viewer?.accounts
        if (!Array.isArray(accounts) || accounts.length === 0) {
            return unknown("Couldn't read relay usage: check CLOUDFLARE_ACCOUNT_ID and the token's account access.")
        }
        // No groups means no relay traffic yet this month.
        const bytes = Number(accounts[0].callsTurnUsageAdaptiveGroups?.[0]?.sum?.egressBytes ?? 0)
        const usedGb = bytes / 1e9
        return { usedGb, limitGb, paused: usedGb >= limitGb, month }
    } catch (err) {
        return unknown(`Couldn't read relay usage from Cloudflare: ${err instanceof Error ? err.message : String(err)}`)
    }
}
