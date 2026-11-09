import { describe, expect, it, vi } from 'vitest'
import { BACKUP_FORM_RESPONSE_URL, backupFormBody, handleSendTaskToBackupForm, projectAnswer, type BackupFormEnv } from './taskBackupForm'

const ENV: BackupFormEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TASK_BACKUP_FORM_SECRET: 'shared-secret',
}

const TASK = { task_id: 'abc123', stage: 'l0', status: 'submitted', project: { name: 'Ego Nexus', code: null } }

describe('backupFormBody', () => {
  it("answers in the form's own wording", () => {
    const body = backupFormBody(TASK, 'cb@remotasks.com', 'garcia, ina dimaano')
    expect(body.get('entry.852481976')).toBe('cb@remotasks.com')
    expect(body.get('entry.1024918070')).toBe('abc123')
    expect(body.get('entry.1090872663')).toBe('Ego Nexus')
    expect(body.get('entry.352893396')).toBe('L0')
    expect(body.get('entry.174061146')).toBe('Submitted')
    expect(body.get('entry.1949618253')).toBe('garcia, ina dimaano')
  })

  it('maps every finished status and stage', () => {
    expect(backupFormBody({ ...TASK, status: 'rejected' }, 'x', 't').get('entry.174061146')).toBe('Reject/SBQ')
    expect(backupFormBody({ ...TASK, status: 'expired' }, 'x', 't').get('entry.174061146')).toBe('Expire Task')
    expect(backupFormBody({ ...TASK, stage: 'attempt' }, 'x', 't').get('entry.352893396')).toBe('Attempter')
  })

  it("sends a project that isn't one of the choices as Other", () => {
    const body = backupFormBody({ ...TASK, project: { name: 'Brand New', code: null } }, 'x', 't')
    expect(body.get('entry.1090872663')).toBe('__other_option__')
    expect(body.get('entry.1090872663.other_option_response')).toBe('Brand New')
  })
})

describe('projectAnswer', () => {
  it('matches the CTS code or the name, ignoring case, spaces and underscores', () => {
    expect(projectAnswer({ name: 'Aloha OTS', code: null })).toEqual({ option: 'Aloha_OTS' })
    expect(projectAnswer({ name: 'Something', code: 'FILL_METRO' })).toEqual({ option: 'fill_metro' })
    expect(projectAnswer({ name: 'Sweet Yam', code: 'SY-01' })).toEqual({ option: 'sweet yam' })
    expect(projectAnswer(null)).toBeNull()
  })
})

function request(body: unknown = { submission_id: 42 }, secret = 'shared-secret') {
  return new Request('https://tracker.example/api/task-backup-form', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fakeFetch({ sentAt = null as string | null, status = 'submitted', enabled = true, trainer = 'garcia, ina dimaano' as string | null, formStatus = 200 } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/rest/v1/task_submissions?') && init?.method === 'PATCH') return new Response(null, { status: 204 })
    if (url.includes('/rest/v1/task_submissions?')) {
      return Response.json([{ id: 42, ...TASK, status, cb_email: 'cb_one@example.com', backup_form_sent_at: sentAt }])
    }
    if (url.includes('/rest/v1/profiles?')) return Response.json([{ id: 'cb', role: 'contributor', lead_id: 'lead-1', remotasks_email: 'cb@remotasks.com' }])
    if (url.includes('/rest/v1/team_features?')) return Response.json([{ backup_form_enabled: enabled, cts_trainer: trainer }])
    if (url === BACKUP_FORM_RESPONSE_URL) return new Response('ok', { status: formStatus })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

const posted = (fetchImpl: ReturnType<typeof fakeFetch>) => fetchImpl.mock.calls.find(([url]) => String(url) === BACKUP_FORM_RESPONSE_URL)
const patchBody = (fetchImpl: ReturnType<typeof fakeFetch>) =>
  JSON.parse(String(fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body))

describe('handleSendTaskToBackupForm', () => {
  it('posts the task with the Remotasks email and records it as sent', async () => {
    const fetchImpl = fakeFetch()
    expect((await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).status).toBe(200)
    expect(new URLSearchParams(String(posted(fetchImpl)?.[1]?.body)).get('entry.852481976')).toBe('cb@remotasks.com')
    expect(patchBody(fetchImpl)).toMatchObject({ backup_form_error: null })
    expect(patchBody(fetchImpl).backup_form_sent_at).toBeTruthy()
  })

  it('escapes the email for the profile lookup', async () => {
    const fetchImpl = fakeFetch()
    await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes(`email=ilike.${encodeURIComponent('cb\\_one@example.com')}`))).toBe(true)
  })

  it('refuses a caller without the shared secret', async () => {
    for (const secret of ['wrong-secret!', '']) {
      const fetchImpl = fakeFetch()
      expect((await handleSendTaskToBackupForm(request(undefined, secret), ENV, fetchImpl)).status).toBe(401)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('is off without a secret configured', async () => {
    const fetchImpl = fakeFetch()
    expect((await handleSendTaskToBackupForm(request(), { ...ENV, TASK_BACKUP_FORM_SECRET: undefined }, fetchImpl)).status).toBe(500)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a malformed task id', async () => {
    for (const body of [{ submission_id: '42' }, { submission_id: -1 }, {}]) {
      expect((await handleSendTaskToBackupForm(request(body), ENV, fakeFetch())).status).toBe(400)
    }
  })

  it('sends a task only once', async () => {
    const fetchImpl = fakeFetch({ sentAt: '2026-11-09T01:00:00Z' })
    expect(await (await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).json()).toEqual({ sent: true, already: true })
    expect(posted(fetchImpl)).toBeUndefined()
  })

  it("doesn't send a task that isn't finished", async () => {
    const fetchImpl = fakeFetch({ status: 'in_progress' })
    await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(posted(fetchImpl)).toBeUndefined()
  })

  it("does nothing for a team that hasn't turned it on", async () => {
    const fetchImpl = fakeFetch({ enabled: false })
    expect(await (await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).json()).toMatchObject({ sent: false })
    expect(posted(fetchImpl)).toBeUndefined()
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('records why when the team has no trainer', async () => {
    const fetchImpl = fakeFetch({ trainer: null })
    expect((await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).status).toBe(502)
    expect(posted(fetchImpl)).toBeUndefined()
    expect(patchBody(fetchImpl).backup_form_error).toContain('trainer')
  })

  it('records a refusal from the form so an edit can retry it', async () => {
    const fetchImpl = fakeFetch({ formStatus: 400 })
    expect((await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).status).toBe(502)
    expect(patchBody(fetchImpl).backup_form_error).toContain('refused')
    expect(patchBody(fetchImpl).backup_form_attempted_at).toBeTruthy()
    expect(patchBody(fetchImpl).backup_form_sent_at).toBeUndefined()
  })
})
