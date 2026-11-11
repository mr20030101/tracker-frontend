// Vercel Function: lets an admin sign in as a lead or contributor. See src/lib/loginAsGate.ts.
// Needs SUPABASE_SERVICE_ROLE_KEY in the Vercel project's environment.
// The .js extension is required: see api/apply.ts.
import { handleLoginAs } from '../src/lib/loginAsGate.js'

export function POST(request: Request): Promise<Response> {
  return handleLoginAs(request, process.env)
}
