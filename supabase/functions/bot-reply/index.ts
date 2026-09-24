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

    // Recent messages between this pair, oldest first, so the bot sees the conversation instead of
    // treating every incoming message as a one-shot question with no memory of what came before.
    // The trigger fires after insert, so the message that just arrived is already in this table —
    // it comes back as the last row here, no need to append `body` separately.
    const HISTORY_LIMIT = 20
    const { data: historyRows, error: historyError } = await admin
        .from('messages')
        .select('sender_id, body')
        .or(`and(sender_id.eq.${sender_id},recipient_id.eq.${recipient_id}),and(sender_id.eq.${recipient_id},recipient_id.eq.${sender_id})`)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)
    if (historyError) return errorResponse(`Could not load message history: ${historyError.message}`, 500)

    const conversation = (historyRows ?? [])
        .reverse()
        .map((m) => ({ role: (m.sender_id === recipient_id ? 'assistant' : 'user') as 'assistant' | 'user', content: m.body }))

    const { data: faqs, error: faqsError } = await admin.from('bot_faqs').select('keywords, answer').order('sort_order')
    if (faqsError) return errorResponse(`Could not load bot_faqs: ${faqsError.message}`, 500)

    // Matched against the whole recent thread, not just the latest message, so a short follow-up
    // like "what about bad video" still pulls in the right section even though that phrase alone
    // wouldn't otherwise carry enough keywords.
    const questionText = conversation
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n')
    const reference = selectReference(faqs ?? [], questionText)

    const reply = await getReply(groqApiKey, reference, conversation)

    const { error: insertError } = await admin.from('messages').insert({ sender_id: recipient_id, recipient_id: sender_id, body: reply })
    if (insertError) return errorResponse(`Could not send the reply: ${insertError.message}`, 500)

    return Response.json({ message_id, reply }, { headers: corsHeaders })
}

// bot_faqs now holds a large project reference doc alongside the original short app-usage tips, so
// joining every row into every prompt (the original approach) would make each reply slow/expensive
// and bury the relevant answer in irrelevant sections. Instead, only rows whose `keywords` appear
// as a substring of the question are included — a plain match against the same keyword lists the
// FAQs were already tagged with, not full-text search, since the table is small. A char budget
// caps how much can be pulled in even if a question matches several large sections at once.
const REFERENCE_CHAR_BUDGET = 24000

function selectReference(faqs: { keywords: string[]; answer: string }[], question: string): string {
    const q = question.toLowerCase()
    const matched = faqs
        .map((f) => ({ answer: f.answer, score: f.keywords.filter((kw) => q.includes(kw.toLowerCase())).length }))
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score)

    const picked: string[] = []
    let used = 0
    for (const { answer } of matched) {
        if (used + answer.length > REFERENCE_CHAR_BUDGET) break
        picked.push(answer)
        used += answer.length
    }
    return picked.join('\n\n')
}

async function getReply(
    groqApiKey: string,
    reference: string,
    conversation: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
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
                    content: `You are Meera (she/her), a helpful assistant inside the Grey Owls Tracker app for contributors, leads, and admins. Answer only using the reference info below; if it doesn't cover the question, say you're not sure and suggest messaging a lead or admin. Keep answers concise. The chat only renders **bold**, "- " bullet lists and "1. " numbered lists — use those when listing multiple items, plain sentences otherwise. No headers, tables, or other markdown.\n\nReference info:\n${reference}`,
                },
                ...conversation,
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
