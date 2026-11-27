// Cloudflare Pages Function: same as api/login-as.ts on Vercel; see src/lib/loginAsGate.ts.
import { handleLoginAs } from '../../src/lib/loginAsGate.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleLoginAs(request, env)
