// Cloudflare Pages Function: the Apply form's gate. Same handler as api/apply.ts on Vercel; see
// src/lib/applyGate.ts. Needs TURNSTILE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY as secrets in the
// Cloudflare Pages project.
import { handleApply } from '../../src/lib/applyGate.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleApply(request, env)
