import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: corsHeaders })
}

// The team works Asia/Singapore time. Reading the zone's own wall-clock date for this instant
// (via Intl, looked up by name rather than a hardcoded offset) gives the local calendar
// day/weekday without pulling in a timezone library.
const SG_PARTS = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

function isoWeekStart(date: Date): string {
    const parts = Object.fromEntries(SG_PARTS.formatToParts(date).map((p) => [p.type, p.value]))
    const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)))
    const day = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
    return d.toISOString().slice(0, 10)
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        return await handle(request)
    } catch (err) {
        // Without this catch, any unexpected throw (a bad Groq response, a
        // network hiccup, etc.) skips our corsHeaders entirely — the browser
        // then blocks the response as a CORS failure, and supabase-js only
        // ever reports the opaque "Failed to send a request to the Edge
        // Function", hiding the real cause.
        const message = err instanceof Error ? err.message : String(err)
        return errorResponse(`Unexpected error: ${message}`, 500)
    }
})

async function handle(request: Request): Promise<Response> {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!supabaseUrl || !serviceKey) return errorResponse('Supabase service configuration is missing.', 500)
    if (!groqApiKey) return errorResponse('Groq API key is not configured.', 500)

    const admin = createClient(supabaseUrl, serviceKey)
    const authorization = request.headers.get('Authorization')
    const token = authorization?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return errorResponse('Unauthorized: missing access token.', 401)
    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return errorResponse('Unauthorized: invalid access token.', 401)

    const { data: profile } = await admin
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', caller.user.id)
        .single()
    if (!profile?.is_active || !['admin', 'lead'].includes(profile.role)) {
        return errorResponse('Forbidden: only active leads or admins can generate recommendations.', 403)
    }

    const { data: contributors, error: contributorsError } = await admin
        .from('profiles')
        .select('id, name, email, is_active')
        .eq('lead_id', profile.id)
        .eq('role', 'contributor')
    if (contributorsError) return errorResponse(`Could not load contributors: ${contributorsError.message}`, 400)

    if (!contributors || contributors.length === 0) {
        return Response.json(
            {
                recommendation:
                    'No contributors are attached to you yet, so there is nothing to analyze. Once contributors are assigned to you, generate a recommendation to see performance insights.',
            },
            { headers: corsHeaders },
        )
    }

    const weekStart = isoWeekStart(new Date())
    const contributorIds = contributors.map((c) => c.id)

    const [{ data: targets }, { data: submissions }] = await Promise.all([
        admin.from('weekly_targets').select('user_id, target').in('user_id', contributorIds).eq('week_start', weekStart),
        admin.from('task_submissions').select('user_id, cb_email, status, date').gte('date', weekStart),
    ])

    const summary = contributors.map((contributor) => {
        const target = targets?.find((t) => t.user_id === contributor.id)?.target ?? 50
        const submittedThisWeek = (submissions ?? []).filter(
            (s) =>
                s.status === 'submitted' &&
                (s.user_id === contributor.id || s.cb_email?.toLowerCase() === contributor.email.toLowerCase()),
        ).length
        return {
            name: contributor.name,
            is_active: contributor.is_active,
            weekly_target: target,
            submitted_this_week: submittedThisWeek,
            progress_pct: target ? Math.round((submittedThisWeek / target) * 100) : 0,
        }
    })

    const prompt = `You are helping a team lead manage their contributors. Here is this week's performance data for the lead's team, as JSON (submitted_this_week counts submissions with status "submitted"; progress_pct is submitted_this_week / weekly_target):

${JSON.stringify(summary, null, 2)}

Write 3-5 short, specific, actionable recommendations for the lead. Flag active contributors who are behind target or have zero progress, praise standout performers, and suggest concrete next steps. Ignore contributors with is_active: false — they are disabled accounts and not expected to submit anything. Respond as plain text bullet points starting with "-", no headers, no markdown formatting other than the leading dash.`

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            temperature: 0.4,
            max_tokens: 1200,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an experienced team-management coach who specializes in turning raw contributor performance data into clear, actionable guidance for team leads. You reason about trends and context, not just raw numbers — you distinguish contributors who are genuinely struggling from those merely coasting or having an off week, and you factor in whether an account is active before judging its output. Every recommendation you give is grounded in the specific data provided, never generic filler advice. You write with the directness of someone who has managed distributed teams for years: concise, specific, and unafraid to call out both problems and standouts by name.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    })

    if (!groqResponse.ok) {
        const errorText = await groqResponse.text()
        // Two different, standard model names have both failed as
        // "not found" — that smells like the key itself (not the model
        // choice) is the problem, so surface what this key can actually see.
        let modelsHint = ''
        try {
            const modelsResponse = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${groqApiKey}` },
            })
            if (modelsResponse.ok) {
                const modelsData = await modelsResponse.json()
                const ids = (modelsData.data ?? []).map((m: { id: string }) => m.id)
                modelsHint = ` | Models visible to this key: ${ids.length ? ids.join(', ') : 'none'}.`
            } else {
                modelsHint = ` | Listing models with this key also failed (status ${modelsResponse.status}) — the GROQ_API_KEY secret is likely invalid or malformed.`
            }
        } catch {
            // best-effort diagnostic only; ignore failures here
        }
        return errorResponse(`Groq request failed: ${errorText}${modelsHint}`, 502)
    }

    const groqData = await groqResponse.json()
    const recommendation = groqData.choices?.[0]?.message?.content?.trim()
    if (!recommendation) return errorResponse('Groq returned an empty response.', 502)

    return Response.json({ recommendation }, { headers: corsHeaders })
}
