// Vercel Function: receives the public Apply form, checks the visitor is in the Philippines and
// passed Cloudflare Turnstile, then saves the application (see src/lib/applyGate.ts).
// Needs TURNSTILE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY in the Vercel project's environment.
// The .js extension is required: Vercel runs this as an ES module (package.json "type": "module"),
// and Node won't resolve an extensionless import. Vercel compiles applyGate.ts to applyGate.js.
import { handleApply } from '../src/lib/applyGate.js'

export function POST(request: Request): Promise<Response> {
  return handleApply(request, process.env)
}
