import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: corsHeaders })
}

const FALLBACK_REPLY = "Sorry, I'm having trouble answering right now — try again or message your lead or an admin directly."

interface BotReplyRequest {
    message_id: number
    sender_id: string
    recipient_id: string
    body: string
}

// Only the bot_auto_reply() trigger in schema.sql calls this (via pg_net, presenting
// BOT_WEBHOOK_SECRET as a shared secret — see the check below), never the frontend, so there's no
// user JWT to check here. Must be deployed with --no-verify-jwt: the platform's own JWT
// verification rejects a non-JWT Authorization value before this code ever runs otherwise.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        return await handle(request)
    } catch (err) {
        // Without this catch, any unexpected throw (a bad Groq response, a network hiccup, etc.)
        // skips corsHeaders entirely and surfaces only as an opaque failure — see
        // lead-recommendation/index.ts for the same reasoning.
        const message = err instanceof Error ? err.message : String(err)
        return errorResponse(`Unexpected error: ${message}`, 500)
    }
})

async function handle(request: Request): Promise<Response> {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    // A dedicated secret for this one handshake (bot_auto_reply() trigger -> this function),
    // rather than reusing the Supabase service role key — that key comes in two different formats
    // depending on when a project was created/migrated (legacy JWT vs newer sb_secret_...), which
    // made it error-prone to copy correctly. This value is generated once and never changes format.
    const webhookSecret = Deno.env.get('BOT_WEBHOOK_SECRET')
    if (!supabaseUrl || !serviceKey) return errorResponse('Supabase service configuration is missing.', 500)
    if (!groqApiKey) return errorResponse('Groq API key is not configured.', 500)
    if (!webhookSecret) return errorResponse('BOT_WEBHOOK_SECRET is not configured.', 500)

    // Deployed with --no-verify-jwt: BOT_WEBHOOK_SECRET (checked here, not a real Supabase key) is
    // this endpoint's only auth, since it's called by the bot_auto_reply() DB trigger, never a
    // browser — see the comment on that trigger in schema.sql for why platform JWT verification had
    // to be disabled for this one function.
    const authorization = request.headers.get('Authorization')
    const token = authorization?.replace(/^Bearer\s+/i, '').trim()
    if (token !== webhookSecret) return errorResponse('Unauthorized: this endpoint is only for the bot_auto_reply trigger.', 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { message_id, sender_id, recipient_id, body } = (await request.json()) as BotReplyRequest
    if (!sender_id || !recipient_id || !body) return errorResponse('Missing message_id, sender_id, recipient_id, or body.', 400)

    const { data: faqs, error: faqsError } = await admin.from('bot_faqs').select('answer').order('sort_order')
    if (faqsError) return errorResponse(`Could not load bot_faqs: ${faqsError.message}`, 500)

    const reference = (faqs ?? []).map((f) => `- ${f.answer}`).join('\n')

    const reply = await getReply(groqApiKey, reference, body)

    const { error: insertError } = await admin.from('messages').insert({ sender_id: recipient_id, recipient_id: sender_id, body: reply })
    if (insertError) return errorResponse(`Could not send the reply: ${insertError.message}`, 500)

    return Response.json({ message_id, reply }, { headers: corsHeaders })
}

async function getReply(groqApiKey: string, reference: string, question: string): Promise<string> {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            temperature: 0.3,
            max_tokens: 400,
            messages: [
                {
                    role: 'system',
                    content: `You are Tracker Bot, a helpful assistant inside the Grey Owls Tracker app for contributors, leads, and admins. Answer only using the reference info below; if it doesn't cover the question, say you're not sure and suggest messaging a lead or admin. Keep answers short (2-4 sentences), plain text, no markdown.\n\nReference info:\n${reference}`,
                },
                { role: 'user', content: question },
            ],
        }),
    })

    if (!groqResponse.ok) {
        const errorText = await groqResponse.text()
        // Logged for the Supabase dashboard, not shown to the person messaging the bot — see
        // lead-recommendation/index.ts for why the models listing is a useful diagnostic here.
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
        console.error(`Groq request failed: ${errorText}${modelsHint}`)
        return FALLBACK_REPLY
    }

    const groqData = await groqResponse.json()
    const reply = groqData.choices?.[0]?.message?.content?.trim()
    if (!reply) {
        console.error('Groq returned an empty response.')
        return FALLBACK_REPLY
    }
    return reply
}
