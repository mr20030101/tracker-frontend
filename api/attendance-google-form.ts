// Vercel Function: sends a saved attendance entry to the team's Google Form, in the background after
// each save. See src/lib/attendanceGoogleForm.ts. Needs SUPABASE_SERVICE_ROLE_KEY.
// The .js extension is required: see api/apply.ts.
import { handleSendAttendanceToGoogleForm } from '../src/lib/attendanceGoogleForm.js'

export function POST(request: Request): Promise<Response> {
  return handleSendAttendanceToGoogleForm(request, process.env)
}
