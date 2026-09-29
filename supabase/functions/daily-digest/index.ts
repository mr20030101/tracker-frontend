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

// The business week runs Tuesday to Monday, and weekly_targets are keyed by that Tuesday (see
// startOfWeek in src/lib/week.ts). This used to start weeks on Monday, so the digest never found a
// target someone had set and always compared against the default 50.
function startOfBusinessWeek(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 2 + 7) % 7))
    return d.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

function formatDay(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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

type Admin = ReturnType<typeof createClient>

// The Meera bot account the digest posts as, created on first use.
async function digestBotId(admin: Admin): Promise<string | Response> {
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

    return botId
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

    // {"mode": "weekly"} sends last week's report instead of yesterday's digest. Schedule it for
    // Tuesday morning (UTC+8), once the business week has closed, e.g.
    //   select cron.schedule('weekly-report', '0 1 * * 2', $$ select net.http_post(
    //     url := '<project url>/functions/v1/daily-digest',
    //     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <service role key>'),
    //     body := '{"mode": "weekly"}'::jsonb) $$);
    // (01:00 UTC is 09:00 in Singapore/Manila.)
    const body = await request.json().catch(() => ({}))
    const mode = body?.mode === 'weekly' ? 'weekly' : 'daily'

    const botId = await digestBotId(admin)
    if (typeof botId !== 'string') return botId

    if (mode === 'weekly') return weeklyReport(admin, botId)

    const yesterday = localDateString(1)
    const weekStart = startOfBusinessWeek(yesterday)

    const [{ data: leads }, { data: contributors }, { data: yesterdaySubs }, { data: weekSubs }, { data: targets }] = await Promise.all([
        admin.from('profiles').select('id, name, email').eq('role', 'lead').eq('is_active', true),
        admin.from('profiles').select('id, name, email, lead_id').eq('role', 'contributor').eq('is_active', true),
        admin.from('task_submissions').select('user_id, cb_email, status, snipboard_url').eq('date', yesterday),
        admin.from('task_submissions').select('user_id, cb_email, status').eq('status', 'submitted').gte('date', weekStart).lte('date', yesterday),
        admin.from('weekly_targets').select('user_id, target').eq('week_start', weekStart),
    ])

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

// Last finished business week (Tuesday to Monday), per team: each lead gets their own team's
// numbers, and each admin an overview of every team.
async function weeklyReport(admin: Admin, botId: string): Promise<Response> {
    const today = localDateString(0)
    const weekStart = addDays(startOfBusinessWeek(today), -7)
    const weekEnd = addDays(weekStart, 6)

    const [{ data: leads }, { data: admins }, { data: contributors }, { data: weekSubs }, { data: targets }] = await Promise.all([
        admin.from('profiles').select('id, name, email').eq('role', 'lead').eq('is_active', true),
        admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true),
        admin.from('profiles').select('id, name, email, lead_id').eq('role', 'contributor').eq('is_active', true),
        admin.from('task_submissions').select('user_id, cb_email').eq('status', 'submitted').gte('date', weekStart).lte('date', weekEnd),
        admin.from('weekly_targets').select('user_id, target').eq('week_start', weekStart),
    ])

    const targetByUserId = new Map((targets ?? []).map((t) => [t.user_id as string, t.target as number]))
    type Row = { name: string; count: number; target: number; leadId: string | null }
    const rows: Row[] = (contributors ?? []).map((c) => ({
        name: c.name,
        count: (weekSubs ?? []).filter((r) => belongsTo(r, c)).length,
        target: targetByUserId.get(c.id) ?? 50,
        leadId: c.lead_id,
    }))

    const title = `Weekly Report — ${formatDay(weekStart)} to ${formatDay(weekEnd)}`
    let sent = 0
    const post = async (recipientId: string, lines: string[]) => {
        const { error } = await admin.from('messages').insert({ sender_id: botId, recipient_id: recipientId, body: lines.join('\n') })
        if (!error) sent += 1
    }

    const overview: string[] = []
    for (const lead of leads ?? []) {
        const team = rows.filter((r) => r.leadId === lead.id)
        if (team.length === 0) continue
        const total = team.reduce((sum, r) => sum + r.count, 0)
        const target = team.reduce((sum, r) => sum + r.target, 0)
        const pct = target ? Math.round((total / target) * 100) : 0
        const onTarget = team.filter((r) => r.count > 0 && r.count >= r.target)
        const below = team.filter((r) => r.count > 0 && r.count < r.target).sort((a, b) => a.count / a.target - b.count / b.target)
        const none = team.filter((r) => r.count === 0)
        const top = [...team].sort((a, b) => b.count - a.count)[0]

        const lines = [title, '', `Your team submitted ${total} tasks against a combined target of ${target} (${pct}%).`]
        lines.push('', `On target (${onTarget.length} of ${team.length}): ${onTarget.length ? onTarget.map((r) => `${r.name} (${r.count})`).join(', ') : 'nobody yet'}`)
        if (below.length) lines.push('', `Below target: ${below.map((r) => `${r.name} (${r.count}/${r.target})`).join(', ')}`)
        if (none.length) lines.push('', `No submissions all week: ${none.map((r) => r.name).join(', ')}`)
        if (top && top.count > 0) lines.push('', `Top contributor: ${top.name} with ${top.count}.`)
        await post(lead.id, lines)

        overview.push(`${lead.name}: ${total}/${target} (${pct}%), ${onTarget.length} of ${team.length} on target, ${none.length} with none`)
    }

    const unassigned = rows.filter((r) => !r.leadId)
    if (unassigned.length) {
        const total = unassigned.reduce((sum, r) => sum + r.count, 0)
        const target = unassigned.reduce((sum, r) => sum + r.target, 0)
        overview.push(`No lead: ${total}/${target} (${target ? Math.round((total / target) * 100) : 0}%), ${unassigned.length} contributors`)
    }

    if (overview.length) {
        const allTotal = rows.reduce((sum, r) => sum + r.count, 0)
        const allTarget = rows.reduce((sum, r) => sum + r.target, 0)
        const lines = [
            title,
            '',
            `All teams: ${allTotal} tasks against ${allTarget} (${allTarget ? Math.round((allTotal / allTarget) * 100) : 0}%).`,
            '',
            ...overview,
        ]
        // The digest bot's own profile has the admin role; it doesn't need the report.
        for (const a of admins ?? []) if (a.id !== botId) await post(a.id, lines)
    }

    return Response.json({ sent, mode: 'weekly', week_start: weekStart, week_end: weekEnd }, { headers: corsHeaders })
}
