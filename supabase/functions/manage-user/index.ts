import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', caller.user.id).single()
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

        // The login is the applicant's Remotasks email: tasks are matched to a contributor
        // by profiles.email = cb_email, so their submissions attach to this account.
        // createUser (not the upsert used below) so an existing login is never overwritten.
        const email = application.remotasks_email
        const temporaryPassword = generateTemporaryPassword()
        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email,
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: { name: application.full_name, role: 'contributor' },
        })
        if (createError) {
            return errorResponse(`Could not create a login for ${email}: ${createError.message}`, 422)
        }
        const userId = created.user.id

        // If either write below fails, remove the login again so accepting can simply be retried.
        const rollback = () => admin.auth.admin.deleteUser(userId)

        const { error: profileError } = await admin.from('profiles').upsert({
            id: userId,
            name: application.full_name,
            email,
            role: 'contributor',
            lead_id: application.lead_id,
            is_active: true,
            must_change_password: true,
            updated_at: reviewedAt,
        })
        if (profileError) {
            await rollback()
            return errorResponse(`Profile creation failed: ${profileError.message}`, 400)
        }

        const { data: accepted, error: acceptError } = await admin
            .from('hiring_applications')
            .update({ status: 'accepted', reviewed_by: caller.user.id, reviewed_at: reviewedAt, user_id: userId })
            .eq('id', application.id)
            .eq('status', 'pending')
            .select('id')
        if (acceptError || !accepted?.length) {
            await rollback()
            return acceptError
                ? errorResponse(`Could not accept this application: ${acceptError.message}`, 400)
                : errorResponse('This application was already reviewed.', 409)
        }

        return Response.json(
            { id: application.id, status: 'accepted', user_id: userId, email, temporary_password: temporaryPassword },
            { headers: corsHeaders },
        )
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
        return Response.json({ id: data.user.id }, { headers: corsHeaders })
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