import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)
    const authorization = request.headers.get('Authorization')
    const token = authorization?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    const { data: caller } = await admin.auth.getUser(token)
    if (!caller.user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', caller.user.id).single()
    if (!profile?.is_active || !['admin', 'lead'].includes(profile.role)) {
        return new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    const body = await request.json()
    if (body.password && body.id) {
        const { data, error } = await admin.auth.admin.updateUserById(body.id, { password: body.password })
        if (error) return new Response(error.message, { status: 400, headers: corsHeaders })
        return Response.json({ id: data.user.id }, { headers: corsHeaders })
    }

    const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name, role: body.role },
    })
    if (error) return new Response(error.message, { status: 400, headers: corsHeaders })
    return Response.json({ id: data.user.id }, { headers: corsHeaders })
})