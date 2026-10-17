import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_FORM_RESPONSE_URL, googleFormBody, handleGoogleFormStatus, handleSendAttendanceToGoogleForm, type GoogleFormEnv } from './attendanceGoogleForm'

const ENV: GoogleFormEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  ATTENDANCE_GOOGLE_FORM: 'on',
}
const USER_ID = '11111111-2222-3333-4444-555555555555'

describe('googleFormBody', () => {
  it("uses the form's own wording and skips the task section when not tasking", () => {
    const body = googleFormBody({ hours: '7+', tasking_status: 'Training', task_id: null, screenshot_url: null }, 'cb@example.com')
    expect(body.get('entry.787543998')).toBe('cb@example.com')
    expect(body.get('entry.75953420')).toBe('7 hours and above')
    expect(body.get('entry.236084842')).toBe('Training')
    expect(body.get('pageHistory')).toBe('0')
    expect(body.has('entry.415325970')).toBe(false)
  })

  it('fills the task section when tasking', () => {
    const body = googleFormBody({ hours: '1-2', tasking_status: 'Tasking', task_id: 'abc123', screenshot_url: 'https://snipboard.io/x' }, 'cb@example.com')
    expect(body.get('entry.75953420')).toBe('1–2 hours')
    expect(body.get('entry.415325970')).toBe('abc123')
    expect(body.get('entry.2058498316')).toBe('https://snipboard.io/x')
    expect(body.get('pageHistory')).toBe('0,1')
  })

  it('answers N/A for the statuses the form also sends to the task section', () => {
    const body = googleFormBody(
      { hours: '4-6', tasking_status: 'All Courses Completed (Primary, Secondary & Tertiary) – Empty Queue', task_id: null, screenshot_url: null },
      'cb@example.com',
    )
    expect(body.get('entry.415325970')).toBe('N/A')
    expect(body.get('pageHistory')).toBe('0,1')
  })

  it('labels support entries the way the form does', () => {
    expect(googleFormBody({ hours: 'absent', tasking_status: 'Absent', task_id: null, screenshot_url: null }, 'x').get('entry.75953420')).toBe(
      'Absent (from support entry)',
    )
  })
})

function request(body: unknown = { user_id: USER_ID, date: '2026-10-17' }) {
  return new Request('https://tracker.example/api/attendance-google-form', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fakeFetch({ sentAt = null as string | null, formStatus = 200, visible = true } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER_ID, email: 'cb@example.com' })
    if (url.includes('/rest/v1/profiles')) return Response.json([{ is_active: true, must_change_password: false }])
    if (url.includes('/rest/v1/attendance?') && init?.method === 'PATCH') return new Response(null, { status: 204 })
    if (url.includes('/rest/v1/attendance?')) {
      return Response.json(
        visible
          ? [{ id: 7, hours: '2-4', tasking_status: 'Training', task_id: null, screenshot_url: null, updated_at: '2026-10-17T07:00:00+00:00', google_form_sent_at: sentAt, person: { email: 'cb@example.com' } }]
          : [],
      )
    }
    if (url === GOOGLE_FORM_RESPONSE_URL) return new Response('ok', { status: formStatus })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

const patchBody = (fetchImpl: ReturnType<typeof fakeFetch>) =>
  JSON.parse(String(fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body))

describe('handleSendAttendanceToGoogleForm', () => {
  it('posts the saved entry to the form and records it as sent', async () => {
    const fetchImpl = fakeFetch()
    const response = await handleSendAttendanceToGoogleForm(request(), ENV, fetchImpl)
    expect(response.status).toBe(200)
    const post = fetchImpl.mock.calls.find(([url]) => String(url) === GOOGLE_FORM_RESPONSE_URL)
    expect(new URLSearchParams(String(post?.[1]?.body)).get('entry.787543998')).toBe('cb@example.com')
    expect(patchBody(fetchImpl)).toMatchObject({ google_form_error: null })
    expect(patchBody(fetchImpl).google_form_sent_at).toBeTruthy()
  })

  it("doesn't send the same save twice", async () => {
    const fetchImpl = fakeFetch({ sentAt: '2026-10-17T07:00:05+00:00' })
    expect((await handleSendAttendanceToGoogleForm(request(), ENV, fetchImpl)).status).toBe(200)
    expect(fetchImpl.mock.calls.some(([url]) => String(url) === GOOGLE_FORM_RESPONSE_URL)).toBe(false)
  })

  it('records a refusal from the form so it can be retried', async () => {
    const fetchImpl = fakeFetch({ formStatus: 400 })
    expect((await handleSendAttendanceToGoogleForm(request(), ENV, fetchImpl)).status).toBe(502)
    expect(patchBody(fetchImpl).google_form_error).toContain('refused')
    expect(patchBody(fetchImpl).google_form_sent_at).toBeUndefined()
  })

  it("won't send an entry the caller can't see", async () => {
    const fetchImpl = fakeFetch({ visible: false })
    expect((await handleSendAttendanceToGoogleForm(request(), ENV, fetchImpl)).status).toBe(404)
    expect(fetchImpl.mock.calls.some(([url]) => String(url) === GOOGLE_FORM_RESPONSE_URL)).toBe(false)
  })

  it('rejects a malformed request', async () => {
    expect((await handleSendAttendanceToGoogleForm(request({ user_id: 'x', date: 'today' }), ENV, fakeFetch())).status).toBe(400)
  })

  it('does nothing at all while sending is off', async () => {
    for (const setting of [undefined, '', 'off']) {
      const fetchImpl = fakeFetch()
      const response = await handleSendAttendanceToGoogleForm(request(), { ...ENV, ATTENDANCE_GOOGLE_FORM: setting }, fetchImpl)
      expect(await response.json()).toEqual({ sent: false, disabled: true })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
})

describe('handleGoogleFormStatus', () => {
  it('reports whether sending is on', async () => {
    expect(await handleGoogleFormStatus(ENV).json()).toEqual({ enabled: true })
    expect(await handleGoogleFormStatus({ ...ENV, ATTENDANCE_GOOGLE_FORM: undefined }).json()).toEqual({ enabled: false })
  })
})
