import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: corsHeaders })
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
        return Response.json({ id: data.user.id }, { headers: corsHeaders })
    }

    if (!body.email || !body.password || !body.name) return errorResponse('Name, email, and password are required.', 400)

    const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existingUser = existingUsers.users.find((user) => user.email?.toLowerCase() === body.email.toLowerCase())
    let userId = existingUser?.id

    if (userId) {
        const { error } = await admin.auth.admin.updateUserById(userId, {
            password: body.password,
            email_confirm: true,
            user_metadata: { name: body.name, role: body.role },
        })
        if (error) return errorResponse(`User update failed: ${error.message}`, 400)
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: { name: body.name, role: body.role },
        })
        if (error) return errorResponse(`User creation failed: ${error.message}`, 400)
        userId = data.user.id
    }

    const { error: profileError } = await admin.from('profiles').upsert({
        id: userId,
        name: body.name,
        email: body.email,
        role: body.role ?? 'contributor',
        shift: body.shift ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
    })
    if (profileError) return errorResponse(`Profile update failed: ${profileError.message}`, 400)
    return Response.json({ id: userId }, { headers: corsHeaders })
})