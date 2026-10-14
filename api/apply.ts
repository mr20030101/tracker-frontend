// Vercel Function: receives the public Apply form, checks the visitor is in the Philippines and
// passed Cloudflare Turnstile, then saves the application (see src/lib/applyGate.ts).
// Needs TURNSTILE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY in the Vercel project's environment.
import { handleApply } from '../src/lib/applyGate'

export function POST(request: Request): Promise<Response> {
  return handleApply(request, process.env)
}
