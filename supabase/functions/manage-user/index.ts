import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { accountEmail, type AccountEmailInput } from './account-email.ts'
import { createAccount } from './create-account.ts'
import { APPLICANT_EMAIL, bootcampVars, emailApplicants, logoFrom, siteFrom, type OutgoingEmail } from './applicant-email.ts'
import { resendError, resendRequest, type Sender } from './resend.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: corsHeaders })
}

// No 0/O/1/l/I, so a password read out or retyped from a chat message can't be misread.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generateTemporaryPassword(length = 12) {
    const bytes = crypto.getRandomValues(new Uint8Array(length))
    return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('')
}

async function sendMail(apiKey: string, sender: Sender, email: OutgoingEmail) {
    const mail = resendRequest(apiKey, sender, email)
    const response = await fetch(mail.url, { method: 'POST', headers: mail.headers, body: mail.body })
    if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(resendError(response.status, detail))
    }
}

// Until a domain is verified in Resend, only its own onboarding@resend.dev sender can be used, and it
// delivers only to the address of the Resend account owner. Set MAIL_FROM_EMAIL once a domain is verified.
const mailSender = (): Sender => ({
    name: Deno.env.get('MAIL_FROM_NAME') ?? 'Grey Owls Tracker',
    email: Deno.env.get('MAIL_FROM_EMAIL') ?? 'onboarding@resend.dev',
})

const siteOrigin = (request: Request) => siteFrom(Deno.env.get('SITE_URL') ?? request.headers.get('origin') ?? '')

/**
 * Emails someone their new or reset password. It never fails the request it belongs to: the account
 * already exists (or the password is already changed), so this only reports whether the email went and,
 * if not, why, and the person who did it can pass the details on themselves.
 */
async function emailAccount(request: Request, input: Omit<AccountEmailInput, 'loginUrl' | 'logoUrl'>): Promise<{ emailed_to?: string; email_error?: string }> {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return { email_error: 'Email sending is not set up yet.' }
    if (!input.to) return { email_error: 'There is no email address on file to send it to.' }
    const origin = siteOrigin(request)
    try {
        await sendMail(apiKey, mailSender(), accountEmail({ ...input, loginUrl: origin ? `${origin}/login` : '', logoUrl: logoFrom(origin) }))
        return { emailed_to: input.to }
    } catch (error) {
        return { email_error: error instanceof Error ? error.message : String(error) }
    }
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return errorResponse('Supabase service configuration is missing.', 500)
    const admin = createClient(supabaseUrl, serviceKey)
    const authorization = request.headers.get('Authorization')
    const token = authorization?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return errorResponse('Unauthorized: missing access token.', 401)
    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return errorResponse('Unauthorized: invalid access token.', 401)

    const { data: profile } = await admin.from('profiles').select('role, is_active, name, email').eq('id', caller.user.id).single()
    if (!profile?.is_active || !['admin', 'lead'].includes(profile.role)) {
        return errorResponse('Forbidden: only active admins or leads can manage users.', 403)
    }

    const body = await request.json()
    if (body.action === 'review-application') {
        if (!body.id || !['accept', 'deny'].includes(body.decision)) {
            return errorResponse('An application id and a decision (accept or deny) are required.', 400)
        }

        const { data: application } = await admin.from('hiring_applications').select('*').eq('id', body.id).maybeSingle()
        if (!application) return errorResponse('Application not found.', 404)
        // A lead reviews only their own applicants; an admin may review anyone's.
        if (profile.role !== 'admin' && application.lead_id !== caller.user.id) {
            return errorResponse('Forbidden: this application belongs to another lead.', 403)
        }
        if (application.status !== 'pending') return errorResponse(`This application was already ${application.status}.`, 409)

        const reviewedAt = new Date().toISOString()

        if (body.decision === 'deny') {
            const { data: denied, error } = await admin
                .from('hiring_applications')
                .update({ status: 'denied', reviewed_by: caller.user.id, reviewed_at: reviewedAt })
                .eq('id', application.id)
                .eq('status', 'pending')
                .select('id')
            if (error) return errorResponse(`Could not deny this application: ${error.message}`, 400)
            if (!denied?.length) return errorResponse('This application was already reviewed.', 409)
            return Response.json({ id: application.id, status: 'denied' }, { headers: corsHeaders })
        }

        // Accepting only records the decision. The account is created separately, later, by the
        // 'create-account' action below, so accepting someone never creates or emails a login.
        const { data: accepted, error: acceptError } = await admin
            .from('hiring_applications')
            .update({ status: 'accepted', reviewed_by: caller.user.id, reviewed_at: reviewedAt })
            .eq('id', application.id)
            .eq('status', 'pending')
            .select('id')
        if (acceptError) return errorResponse(`Could not accept this application: ${acceptError.message}`, 400)
        if (!accepted?.length) return errorResponse('This application was already reviewed.', 409)
        return Response.json({ id: application.id, status: 'accepted' }, { headers: corsHeaders })
    }

    // Creates the login and profile for an applicant who has already been accepted.
    if (body.action === 'create-account') {
        if (!body.id) return errorResponse('An application id is required.', 400)
        const { data: application } = await admin
            .from('hiring_applications')
            .select('id, lead_id, full_name, active_email, remotasks_email, status, user_id')
            .eq('id', body.id)
            .maybeSingle()
        // The email goes out in the name of the lead the applicant applied to.
        const { data: leadProfile } = application
            ? await admin.from('profiles').select('name, email').eq('id', application.lead_id).maybeSingle()
            : { data: null }

        const outcome = await createAccount({ id: caller.user.id, role: profile.role }, {
            application,
            newPassword: generateTemporaryPassword,
            // createUser (not an upsert) so an existing login is never overwritten.
            createLogin: async ({ email, password, name }) => {
                const { data: created, error } = await admin.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { name, role: 'contributor' },
                })
                return error || !created.user ? { error: error?.message ?? 'No user was returned.' } : { id: created.user.id }
            },
            removeLogin: async (userId) => {
                await admin.auth.admin.deleteUser(userId)
            },
            saveProfile: async ({ id, name, email, lead_id }) => {
                const { error } = await admin.from('profiles').upsert({
                    id,
                    name,
                    email,
                    role: 'contributor',
                    lead_id,
                    is_active: true,
                    must_change_password: true,
                    updated_at: new Date().toISOString(),
                })
                return error?.message ?? null
            },
            linkApplication: async (applicationId, userId) => {
                const { data: linked, error } = await admin
                    .from('hiring_applications')
                    .update({ user_id: userId })
                    .eq('id', applicationId)
                    .eq('status', 'accepted')
                    .is('user_id', null)
                    .select('id')
                return error ? { error: error.message } : { linked: Boolean(linked?.length) }
            },
            notify: ({ to, name, loginEmail, password }) =>
                emailAccount(request, {
                    kind: 'activation',
                    to,
                    name,
                    loginEmail,
                    password,
                    from: { name: leadProfile?.name ?? profile.name, email: leadProfile?.email ?? profile.email },
                }),
        })
        if (!outcome.ok) return errorResponse(outcome.error, outcome.status)
        const { ok: _ok, ...result } = outcome
        return Response.json(result, { headers: corsHeaders })
    }

    // Marks an accepted applicant onboarded (after the bootcamp), or reverses that. Separate from
    // creating their account. A lead may only mark their own applicants; an admin anyone's.
    if (body.action === 'set-onboarded') {
        if (!body.id || typeof body.onboarded !== 'boolean') {
            return errorResponse('An application id and onboarded (true or false) are required.', 400)
        }
        const { data: application } = await admin.from('hiring_applications').select('id, lead_id, status').eq('id', body.id).maybeSingle()
        if (!application) return errorResponse('Application not found.', 404)
        if (profile.role !== 'admin' && application.lead_id !== caller.user.id) {
            return errorResponse('Forbidden: this application belongs to another lead.', 403)
        }
        if (application.status !== 'accepted') return errorResponse('Only accepted applicants can be marked onboarded.', 409)

        const { data: updated, error } = await admin
            .from('hiring_applications')
            .update({ onboarded_at: body.onboarded ? new Date().toISOString() : null })
            .eq('id', application.id)
            .select('id, onboarded_at')
            .single()
        if (error) return errorResponse(`Could not update onboarding status: ${error.message}`, 400)
        return Response.json(updated, { headers: corsHeaders })
    }

    // Admin-only hard reset: permanently deletes every hiring application, any lead, any status.
    // This only clears the application history — a contributor account already created from one
    // lives in profiles/auth, not in this table, so it is untouched.
    if (body.action === 'clear-hiring') {
        if (profile.role !== 'admin') return errorResponse('Forbidden: only an admin can clear hiring data.', 403)
        const { error, count } = await admin.from('hiring_applications').delete({ count: 'exact' }).gt('id', 0)
        if (error) return errorResponse(`Could not clear hiring applications: ${error.message}`, 400)
        return Response.json({ deleted: count ?? 0 }, { headers: corsHeaders })
    }

    if (body.action === 'email-applicants') {
        const apiKey = Deno.env.get('RESEND_API_KEY')
        if (!apiKey) return errorResponse('Email sending is not set up yet: the RESEND_API_KEY secret is missing on this function.', 503)

        // The lead fills in the date, time, project and Google Meet link for each send.
        const details = bootcampVars(body.details)
        if (!details.ok) return errorResponse(details.error, 400)

        const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
        const { data: applications, error: loadError } = await admin
            .from('hiring_applications')
            .select('id, lead_id, full_name, active_email, remotasks_email, status')
            .in('id', ids)
        if (loadError) return errorResponse(`Could not load those applications: ${loadError.message}`, 400)
        const leadIds = [...new Set((applications ?? []).map((application) => application.lead_id))]
        const { data: leadRows } = leadIds.length
            ? await admin.from('profiles').select('id, name, email').in('id', leadIds)
            : { data: [] }

        const sender = mailSender()
        const site = siteOrigin(request)

        // Who may be emailed, and the per-recipient results, are decided in applicant-email.ts.
        const outcome = await emailApplicants(ids, { id: caller.user.id, role: profile.role }, {
            applications: applications ?? [],
            leads: new Map((leadRows ?? []).map((lead) => [lead.id, { name: lead.name, email: lead.email }])),
            template: APPLICANT_EMAIL,
            vars: details.vars,
            loginUrl: site ? `${site}/login` : '',
            logoUrl: logoFrom(site),
            send: (email) => sendMail(apiKey, sender, email),
        })
        if (!outcome.ok) return errorResponse(outcome.error, outcome.status)

        if (outcome.sent.length) {
            await admin.from('hiring_applications').update({ emailed_at: new Date().toISOString() }).in('id', outcome.sent)
        }
        return Response.json({ sent: outcome.sent, failed: outcome.failed }, { headers: corsHeaders })
    }

    if (body.action === 'delete-user') {
        if (!body.id) return errorResponse('A user id is required.', 400)
        if (body.id === caller.user.id) return errorResponse('You cannot delete your own account.', 422)

        const { error } = await admin.auth.admin.deleteUser(body.id)
        if (error) return errorResponse(`User deletion failed: ${error.message}`, 400)
        return Response.json({ id: body.id }, { headers: corsHeaders })
    }

    if (body.password && body.id) {
        let targetId = body.id
        if (body.email) {
            const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
            const matchingUser = users.users.find((user) => user.email?.toLowerCase() === body.email.toLowerCase())
            targetId = matchingUser?.id ?? targetId
        }
        if (!targetId) return errorResponse('Target Auth user was not found.', 404)
        const { data, error } = await admin.auth.admin.updateUserById(targetId, { password: body.password })
        if (error) return errorResponse(`Password reset failed: ${error.message}`, 400)
        // An admin/lead setting this password on someone else's behalf, not the user
        // choosing it themselves — force them to pick their own on next sign-in.
        await admin.from('profiles').update({ must_change_password: true }).eq('id', data.user.id)

        // Email them the new password. Someone hired through the tracker gave a contact address on
        // their application, which is the one they read; anyone else is emailed at their login address.
        const { data: target } = await admin.from('profiles').select('name, email').eq('id', data.user.id).maybeSingle()
        const { data: hiredAs } = await admin
            .from('hiring_applications')
            .select('active_email')
            .eq('user_id', data.user.id)
            .order('reviewed_at', { ascending: false })
            .limit(1)
        const loginEmail = data.user.email ?? target?.email ?? ''
        const emailStatus = await emailAccount(request, {
            kind: 'reset',
            to: hiredAs?.[0]?.active_email ?? loginEmail,
            name: target?.name ?? '',
            loginEmail,
            password: body.password,
            from: { name: profile.name, email: profile.email },
        })
        return Response.json({ id: data.user.id, ...emailStatus }, { headers: corsHeaders })
    }

    if (!body.email || !body.password || !body.name) return errorResponse('Name, email, and password are required.', 400)

    // Only an admin caller may hand out a non-contributor role — a lead's
    // logins always come out as contributors, regardless of what was sent.
    const role = profile.role === 'admin' ? (body.role ?? 'contributor') : 'contributor'

    const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existingUser = existingUsers.users.find((user) => user.email?.toLowerCase() === body.email.toLowerCase())
    let userId = existingUser?.id

    if (userId) {
        const { error } = await admin.auth.admin.updateUserById(userId, {
            password: body.password,
            email_confirm: true,
            user_metadata: { name: body.name, role },
        })
        if (error) return errorResponse(`User update failed: ${error.message}`, 400)
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: { name: body.name, role },
        })
        if (error) return errorResponse(`User creation failed: ${error.message}`, 400)
        userId = data.user.id
    }

    const { error: profileError } = await admin.from('profiles').upsert({
        id: userId,
        name: body.name,
        email: body.email,
        role,
        shift: body.shift ?? null,
        is_active: true,
        must_change_password: true,
        updated_at: new Date().toISOString(),
    })
    if (profileError) return errorResponse(`Profile update failed: ${profileError.message}`, 400)
    return Response.json({ id: userId }, { headers: corsHeaders })
})