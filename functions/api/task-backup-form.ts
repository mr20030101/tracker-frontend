// Cloudflare Pages Function: same as api/task-backup-form.ts on Vercel; see src/lib/taskBackupForm.ts.
// Called by the database, not the browser. Needs TASK_BACKUP_FORM_SECRET and SUPABASE_SERVICE_ROLE_KEY.
import { handleSendTaskToBackupForm } from '../../src/lib/taskBackupForm.js'
import type { PagesContext } from '../../src/lib/host.js'

export const onRequestPost = ({ request, env }: PagesContext) => handleSendTaskToBackupForm(request, env)
