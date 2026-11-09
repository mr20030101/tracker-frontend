// Vercel Function: sends a finished task to the "Back Up Task Tracker Remote" Google Form. Called by
// the database (task_backup_form_notify), not the browser. See src/lib/taskBackupForm.ts. Needs
// TASK_BACKUP_FORM_SECRET and SUPABASE_SERVICE_ROLE_KEY.
// The .js extension is required: see api/apply.ts.
import { handleSendTaskToBackupForm } from '../src/lib/taskBackupForm.js'

export function POST(request: Request): Promise<Response> {
  return handleSendTaskToBackupForm(request, process.env)
}
