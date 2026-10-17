// Server side of sending attendance to the team's "Centralize | Attendance" Google Form, run by the
// Vercel Function in api/attendance-google-form.ts after each save. The entry is read from the
// database with the caller's own access (so only someone who can see it can send it, and what's
// sent is what was saved, not what the browser says), posted to the form's formResponse address
// the way the form itself would, and the result recorded on the entry (google_form_sent_at /
// google_form_error) with the service role.
// Kept free of Vercel and browser APIs so it can be tested with a fake fetch (hence the .js imports).

import { serverSupabaseConfig, signedInCaller, type ServerSupabaseEnv } from './serverAuth.js'

export const GOOGLE_FORM_RESPONSE_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdItgT4AYcL14m0A3t5Rx7nGaySxDe64J1VZtInYD0ukepAfg/formResponse'

// The form's question ids (its "entry.<id>" fields).
const FIELDS = {
  email: 'entry.787543998',
  hours: 'entry.75953420',
  status: 'entry.236084842',
  taskId: 'entry.415325970',
  screenshot: 'entry.2058498316',
}

// The form's own wording for each hours answer, which has to match exactly.
const HOURS_ANSWERS: Record<string, string> = {
  '1-2': '1–2 hours',
  '2-4': '2–4 hours',
  '4-6': '4–6 hours',
  '7+': '7 hours and above',
  absent: 'Absent (from support entry)',
  discontinued: 'Discontinued (from support entry)',
  disabled: 'Disabled (from support entry)',
}

// Statuses the form sends on to its second section (Task ID and screenshot, both required there).
const STATUSES_WITH_TASK_SECTION = new Set(['Tasking', 'All Courses Completed (Primary, Secondary & Tertiary) – Empty Queue'])

interface EntryRow {
  id: number
  hours: string
  tasking_status: string
  task_id: string | null
  screenshot_url: string | null
  google_form_sent_at: string | null
  person: { email: string } | null
}

/** The form's fields for an entry, as the form's own page would post them. */
export function googleFormBody(entry: Pick<EntryRow, 'hours' | 'tasking_status' | 'task_id' | 'screenshot_url'>, email: string): URLSearchParams {
  const body = new URLSearchParams({
    [FIELDS.email]: email,
    [FIELDS.hours]: HOURS_ANSWERS[entry.hours] ?? entry.hours,
    [FIELDS.status]: entry.tasking_status,
    fvv: '1',
    pageHistory: '0',
  })
  if (STATUSES_WITH_TASK_SECTION.has(entry.tasking_status)) {
    body.set(FIELDS.taskId, entry.task_id || 'N/A')
    body.set(FIELDS.screenshot, entry.screenshot_url || 'N/A')
    body.set('pageHistory', '0,1')
  }
  return body
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (status: number, message: string) => json(status, { message })

export interface GoogleFormEnv extends ServerSupabaseEnv {
  /** "on" to send attendance to the Google Form. Anything else (or unset) leaves it off, e.g. while testing. */
  ATTENDANCE_GOOGLE_FORM?: string
}

export const googleFormEnabled = (env: GoogleFormEnv) => env.ATTENDANCE_GOOGLE_FORM?.trim().toLowerCase() === 'on'

/** GET: whether sending is on, so the Attendance page only shows the Google Form status when it is. */
export function handleGoogleFormStatus(env: GoogleFormEnv): Response {
  return json(200, { enabled: googleFormEnabled(env) })
}

export async function handleSendAttendanceToGoogleForm(request: Request, env: GoogleFormEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  // Off: nothing is sent or recorded, so turning it on later doesn't send these older saves.
  if (!googleFormEnabled(env)) return json(200, { sent: false, disabled: true })

  const { url, anonKey, serviceKey } = serverSupabaseConfig(env)
  if (!serviceKey) {
    console.error('api/attendance-google-form: SUPABASE_SERVICE_ROLE_KEY is not set.')
    return refuse(500, "Attendance can't be sent to the Google Form right now.")
  }

  const caller = await signedInCaller(request, env, fetchImpl)
  if (!caller) return refuse(401, 'Sign in again.')

  const input = (await request.json().catch(() => null)) as { user_id?: unknown; date?: unknown } | null
  const userId = typeof input?.user_id === 'string' && /^[0-9a-f-]{36}$/i.test(input.user_id) ? input.user_id : null
  const date = typeof input?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null
  if (!userId || !date) return refuse(400, 'Which attendance entry?')

  const entryResponse = await fetchImpl(
    `${url}/rest/v1/attendance?user_id=eq.${userId}&date=eq.${date}&select=id,hours,tasking_status,task_id,screenshot_url,google_form_sent_at,person:profiles!attendance_user_id_fkey(email)&limit=1`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${caller.token}` } },
  )
  const [entry] = entryResponse.ok ? ((await entryResponse.json()) as EntryRow[]) : []
  if (!entry?.person?.email) return refuse(404, 'Attendance entry not found.')

  // Only the day's first submission goes to the form: once it's there, later edits and retakes aren't
  // sent, so the sheet gets one row per person per day (and this can't be used to add copies).
  if (entry.google_form_sent_at) return json(200, { sent: true, already: true })

  let error: string | null = null
  try {
    const formResponse = await fetchImpl(GOOGLE_FORM_RESPONSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: googleFormBody(entry, entry.person.email),
      redirect: 'manual',
    })
    // A refused answer (wrong option text, a missing required answer, the form closed) comes back as an error status.
    if (formResponse.status >= 400) error = `The Google Form refused it (${formResponse.status}).`
  } catch (err) {
    console.error('api/attendance-google-form: posting failed:', err)
    error = "The Google Form couldn't be reached."
  }

  await fetchImpl(`${url}/rest/v1/attendance?id=eq.${entry.id}`, {
    method: 'PATCH',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(error ? { google_form_error: error } : { google_form_sent_at: new Date().toISOString(), google_form_error: null }),
  })

  return error ? refuse(502, error) : json(200, { sent: true })
}
