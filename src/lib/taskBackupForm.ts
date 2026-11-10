// Server side of sending finished tasks to the "Back Up Task Tracker Remote" Google Form, run by the
// Vercel Function in api/task-backup-form.ts. The database calls it (task_backup_form_notify in
// supabase/migrations/20261109_task_backup_form.sql) when a task becomes Submitted, Rejected/SBQ or
// Expired, with a shared secret rather than a user's token. The task is read with the service role,
// posted to the form the way the form's own page would, and the result recorded on the task.
// Kept free of Vercel and browser APIs so it can be tested with a fake fetch (hence the .js imports).

import { serverSupabaseConfig, type ServerSupabaseEnv } from './serverAuth.js'

export const BACKUP_FORM_RESPONSE_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeDF3s0JAiTkqNy5og8gApRXxko8qJ2Wy413K1AFfAR8Uf1sg/formResponse'

const FIELDS = {
  email: 'entry.852481976',
  taskId: 'entry.1024918070',
  project: 'entry.1090872663',
  level: 'entry.352893396',
  status: 'entry.174061146',
  trainer: 'entry.1949618253',
}

// The form's Project choices; anything else goes in as its "Other" answer.
const PROJECT_OPTIONS = ['Aloha_OTS', 'Ego Nexus', 'ophiuchus_group', 'sweet yam', 'fill_metro', 'ego-ots-basic']

const LEVEL_BY_STAGE: Record<string, string> = { attempt: 'Attempter', l0: 'L0', l1: 'L1' }

const STATUS_ANSWERS: Record<string, string> = {
  submitted: 'Submitted',
  rejected: 'Reject/SBQ',
  expired: 'Expire Task',
}

export interface BackupFormTask {
  task_id: string | null
  stage: string
  status: string
  project: { name: string; code: string | null } | null
}

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

/** The form's Project choice for a tracker project: its CTS code or name if either is one of the choices. */
export function projectAnswer(project: BackupFormTask['project']): { option: string } | { other: string } | null {
  if (!project) return null
  for (const candidate of [project.code, project.name]) {
    if (!candidate) continue
    const match = PROJECT_OPTIONS.find((option) => normalise(option) === normalise(candidate))
    if (match) return { option: match }
  }
  return { other: project.code?.trim() || project.name.trim() }
}

/** The form's fields for a task, as the form's own page would post them. */
export function backupFormBody(task: BackupFormTask, email: string, trainer: string): URLSearchParams {
  const body = new URLSearchParams({
    [FIELDS.email]: email,
    [FIELDS.taskId]: task.task_id ?? '',
    [FIELDS.level]: LEVEL_BY_STAGE[task.stage] ?? task.stage,
    [FIELDS.status]: STATUS_ANSWERS[task.status] ?? task.status,
    [FIELDS.trainer]: trainer,
    fvv: '1',
    pageHistory: '0',
  })
  const project = projectAnswer(task.project)
  if (project && 'option' in project) body.set(FIELDS.project, project.option)
  if (project && 'other' in project) {
    body.set(FIELDS.project, '__other_option__')
    body.set(`${FIELDS.project}.other_option_response`, project.other)
  }
  return body
}

export interface BackupFormEnv extends ServerSupabaseEnv {
  /** Shared with the database (app_secrets.task_backup_form_secret); unset turns sending off. */
  TASK_BACKUP_FORM_SECRET?: string
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

interface TaskRow extends BackupFormTask {
  id: number
  cb_email: string
  backup_form_sent_at: string | null
}

export async function handleSendTaskToBackupForm(request: Request, env: BackupFormEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const secret = env.TASK_BACKUP_FORM_SECRET?.trim()
  const { url, serviceKey } = serverSupabaseConfig(env)
  if (!secret || !serviceKey) {
    console.error('api/task-backup-form: TASK_BACKUP_FORM_SECRET or SUPABASE_SERVICE_ROLE_KEY is not set.')
    return json(500, { message: 'Not set up.' })
  }
  const given = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] ?? ''
  if (!sameSecret(given, secret)) return json(401, { message: 'Not allowed.' })

  const input = (await request.json().catch(() => null)) as { submission_id?: unknown } | null
  const id = Number.isSafeInteger(input?.submission_id) && (input!.submission_id as number) > 0 ? (input!.submission_id as number) : null
  if (!id) return json(400, { message: 'Which task?' })

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  // A failed read throws rather than coming back empty, so a bad query can't pass for "no such
  // profile" and quietly look like the team having it off.
  const read = async <T>(path: string): Promise<T[]> => {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, { headers })
    if (!response.ok) throw new Error(`Reading ${path.split('?')[0]} failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
    return (await response.json()) as T[]
  }

  try {
    return await send(id, read, headers, url, fetchImpl)
  } catch (err) {
    console.error('api/task-backup-form:', err)
    return json(500, { message: err instanceof Error ? err.message : 'Sending failed.' })
  }
}

async function send(
  id: number,
  read: <T>(path: string) => Promise<T[]>,
  headers: Record<string, string>,
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response> {

  const [task] = await read<TaskRow>(
    `task_submissions?id=eq.${id}&select=id,task_id,cb_email,stage,status,backup_form_sent_at,project:projects(name,code)&limit=1`,
  )
  if (!task) return json(404, { message: 'Task not found.' })
  if (task.backup_form_sent_at) return json(200, { sent: true, already: true })
  if (!STATUS_ANSWERS[task.status]) return json(200, { sent: false, reason: 'not finished' })

  const [person] = await read<{ id: string; role: string; lead_id: string | null }>(
    `profiles?email=ilike.${encodeURIComponent(escapeLike(task.cb_email.trim()))}&select=id,role,lead_id&limit=1`,
  )
  const leadId = person?.role === 'lead' ? person.id : person?.lead_id
  const [team] = leadId
    ? await read<{ backup_form_enabled: boolean; cts_trainer: string | null }>(
        `team_features?lead_id=eq.${encodeURIComponent(leadId)}&select=backup_form_enabled,cts_trainer&limit=1`,
      )
    : []
  if (!team?.backup_form_enabled) return json(200, { sent: false, reason: 'off for this team' })

  let error: string | null = null
  if (!team.cts_trainer) {
    error = "The team has no trainer set (Leads page → CTS trainer), and the form requires one."
  } else {
    try {
      const formResponse = await fetchImpl(BACKUP_FORM_RESPONSE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: backupFormBody(task, task.cb_email.trim(), team.cts_trainer),
        redirect: 'manual',
      })
      if (formResponse.status >= 400) error = `The Google Form refused it (${formResponse.status}).`
    } catch (err) {
      console.error('api/task-backup-form: posting failed:', err)
      error = "The Google Form couldn't be reached."
    }
  }

  const now = new Date().toISOString()
  await fetchImpl(`${url}/rest/v1/task_submissions?id=eq.${task.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(
      error
        ? { backup_form_error: error, backup_form_attempted_at: now }
        : { backup_form_sent_at: now, backup_form_error: null, backup_form_attempted_at: now },
    ),
  })

  return error ? json(502, { message: error }) : json(200, { sent: true })
}
