// Cloudflare Pages Function: same as api/attendance-google-form.ts on Vercel; see
// src/lib/attendanceGoogleForm.ts. Needs SUPABASE_SERVICE_ROLE_KEY.
import { handleGoogleFormStatus, handleSendAttendanceToGoogleForm } from '../../src/lib/attendanceGoogleForm.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleSendAttendanceToGoogleForm(request, env)
export const onRequestGet = ({ env }: PagesContext) => handleGoogleFormStatus(env)
