// Shared by the Vercel Functions' handlers (attendancePhotoGate.ts, attendanceGoogleForm.ts): the
// Supabase settings and who is calling. Kept free of Vercel and browser APIs (hence the .js import).
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './supabaseConfig.js'

export interface ServerSupabaseEnv {
  SUPABASE_URL?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export interface Caller {
  id: string
  email: string
  token: string
}

export function serverSupabaseConfig(env: ServerSupabaseEnv) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

// The signed-in user behind the request's Supabase access token, if it's valid and their account
// is active (read with their own access, so it's their own profile row).
export async function signedInCaller(request: Request, env: ServerSupabaseEnv, fetchImpl: typeof fetch): Promise<Caller | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return null
  const { url, anonKey } = serverSupabaseConfig(env)
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` }
  const userResponse = await fetchImpl(`${url}/auth/v1/user`, { headers })
  if (!userResponse.ok) return null
  const user = (await userResponse.json()) as { id?: string; email?: string }
  if (!user.id) return null
  const profileResponse = await fetchImpl(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=is_active,must_change_password`,
    { headers },
  )
  const [profile] = profileResponse.ok ? ((await profileResponse.json()) as { is_active: boolean; must_change_password: boolean }[]) : []
  if (!profile?.is_active || profile.must_change_password) return null
  return { id: user.id, email: user.email ?? '', token }
}
