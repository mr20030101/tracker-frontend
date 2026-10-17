// Vercel Function: sends a saved attendance entry to the team's Google Form, in the background after
// each save, while ATTENDANCE_GOOGLE_FORM is "on". See src/lib/attendanceGoogleForm.ts. Needs
// SUPABASE_SERVICE_ROLE_KEY.
// The .js extension is required: see api/apply.ts.
import { handleGoogleFormStatus, handleSendAttendanceToGoogleForm } from '../src/lib/attendanceGoogleForm.js'

export function POST(request: Request): Promise<Response> {
  return handleSendAttendanceToGoogleForm(request, process.env)
}

export function GET(): Response {
  return handleGoogleFormStatus(process.env)
}
