import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: corsHeaders })
}

const BOT_EMAIL = 'digest-bot@tracker.internal'
const BOT_NAME = 'Meera'

// The team works UTC+8; task_submissions.date is a plain calendar date with
// no timezone, entered against that local day. Shifting "now" forward by the
// offset before reading UTC fields gives that local calendar date without
// pulling in a timezone library.
function localDateString(daysAgo: number): string {
    const shifted = new Date(Date.now() + 8 * 3600000 - daysAgo * 86400000)
    const y = shifted.getUTCFullYear()
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
    const d = String(shifted.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function startOfIsoWeek(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`)
    const day = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
    return d.toISOString().slice(0, 10)
}

interface SubmissionRow {
    user_id: string | null
    cb_email: string
    status: string
    snipboard_url: string | null
}

function belongsTo(row: { user_id: string | null; cb_email: string }, contributor: { id: string; email: string }) {
    return row.user_id === contributor.id || row.cb_email?.toLowerCase() === contributor.email.toLowerCase()
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return errorResponse('Supabase service configuration is missing.', 500)
    const admin = createClient(supabaseUrl, serviceKey)

    // Allow either the cron job (presenting the service role key itself as a
    // shared secret) or a signed-in admin (for manual/on-demand runs).
    const authorization = request.headers.get('Authorization')
    const token = authorization?.replace(/^Bearer\s+/i, '').trim()
    if (token !== serviceKey) {
        const { data: caller } = await admin.auth.getUser(token)
        if (!caller.user) return errorResponse('Unauthorized: missing or invalid access token.', 401)
        const { data: callerProfile } = await admin.from('profiles').select('role, is_active').eq('id', caller.user.id).single()
        if (!callerProfile?.is_active || callerProfile.role !== 'admin') {
            return errorResponse('Forbidden: only an admin (or the scheduled job) can trigger the digest.', 403)
        }
    }

    const yesterday = localDateString(1)
    const weekStart = startOfIsoWeek(yesterday)

    const [{ data: leads }, { data: contributors }, { data: yesterdaySubs }, { data: weekSubs }, { data: targets }] = await Promise.all([
        admin.from('profiles').select('id, name, email').eq('role', 'lead').eq('is_active', true),
        admin.from('profiles').select('id, name, email, lead_id').eq('role', 'contributor').eq('is_active', true),
        admin.from('task_submissions').select('user_id, cb_email, status, snipboard_url').eq('date', yesterday),
        admin.from('task_submissions').select('user_id, cb_email, status').eq('status', 'submitted').gte('date', weekStart).lte('date', yesterday),
        admin.from('weekly_targets').select('user_id, target').eq('week_start', weekStart),
    ])

    let botId: string
    const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) return errorResponse(`Could not look up the digest bot account: ${listError.message}`, 500)
    const existingBot = existingUsers.users.find((u) => u.email?.toLowerCase() === BOT_EMAIL)
    if (existingBot) {
        botId = existingBot.id
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: BOT_EMAIL,
            password: crypto.randomUUID() + crypto.randomUUID(),
            email_confirm: true,
            user_metadata: { name: BOT_NAME, role: 'admin' },
        })
        if (error) return errorResponse(`Could not create the digest bot account: ${error.message}`, 500)
        botId = data.user.id
        const { error: profileError } = await admin.from('profiles').upsert({
            id: botId,
            name: BOT_NAME,
            email: BOT_EMAIL,
            role: 'admin',
            is_active: true,
            must_change_password: false,
        })
        if (profileError) return errorResponse(`Could not create the digest bot profile: ${profileError.message}`, 500)
    }

    const targetByUserId = new Map((targets ?? []).map((t) => [t.user_id as string, t.target as number]))
    const contributorsByLead = new Map<string, typeof contributors>()
    for (const c of contributors ?? []) {
        if (!c.lead_id) continue
        const list = contributorsByLead.get(c.lead_id) ?? []
        list.push(c)
        contributorsByLead.set(c.lead_id, list)
    }

    let sent = 0
    for (const lead of leads ?? []) {
        const team = contributorsByLead.get(lead.id) ?? []
        if (team.length === 0) continue

        const noSubmission: string[] = []
        const missingSnip: { name: string; count: number }[] = []
        const hitTarget: string[] = []

        for (const c of team) {
            const yRows = ((yesterdaySubs ?? []) as SubmissionRow[]).filter((r) => belongsTo(r, c))
            const submittedYesterday = yRows.filter((r) => r.status === 'submitted')
            if (submittedYesterday.length === 0) noSubmission.push(c.name)

            const missing = submittedYesterday.filter((r) => !r.snipboard_url)
            if (missing.length > 0) missingSnip.push({ name: c.name, count: missing.length })

            const weekCount = (weekSubs ?? []).filter((r) => belongsTo(r, c)).length
            const target = targetByUserId.get(c.id) ?? 50
            if (weekCount >= target) hitTarget.push(c.name)
        }

        const submittedCount = team.length - noSubmission.length
        const lines = [`Daily Digest — ${yesterday}`, '', `Your team: ${submittedCount} of ${team.length} contributors submitted yesterday.`]
        if (noSubmission.length > 0) lines.push('', `No submissions yesterday: ${noSubmission.join(', ')}`)
        if (missingSnip.length > 0) {
            lines.push('', `Missing Snipboard.io link: ${missingSnip.map((m) => `${m.name} (${m.count})`).join(', ')}`)
        }
        if (hitTarget.length > 0) lines.push('', `Hit this week's target: ${hitTarget.join(', ')}`)

        const { error: insertError } = await admin.from('messages').insert({
            sender_id: botId,
            recipient_id: lead.id,
            body: lines.join('\n'),
        })
        if (!insertError) sent += 1
    }

    return Response.json({ sent, date: yesterday }, { headers: corsHeaders })
})
