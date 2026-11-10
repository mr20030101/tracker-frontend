import { describe, expect, it, vi } from 'vitest'
import {
  BACKUP_FORM_RESPONSE_URL,
  BACKUP_FORM_VIEW_URL,
  backupFormBody,
  describeRefusal,
  explainRefusal,
  formChoices,
  handleSendTaskToBackupForm,
  projectAnswer,
  refusedQuestions,
  type BackupFormEnv,
  type BackupFormTask,
} from './taskBackupForm'

const ENV: BackupFormEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TASK_BACKUP_FORM_SECRET: 'shared-secret',
}

const TASK = { task_id: 'abc123', stage: 'l0', status: 'submitted', project: { name: 'Ego Nexus', code: null } }

// The form's page, cut down to the shape Google serves: [id, title, , type, [[entry, options, required]]].
const FORM_PAGE = `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([
  null,
  [
    null,
    [
      [1, 'Remotasks Email:', null, 0, [[852481976, null, 1]]],
      [2, 'Project:', null, 2, [[1090872663, [['Aloha_OTS'], ['Ego Nexus'], ['']], 1]]],
      [3, 'Task Level:', null, 2, [[352893396, [['Attempter'], ['L0'], ['L1']], 1]]],
      [4, 'Task Status', null, 2, [[174061146, [['Submitted'], ['Reject/SBQ'], ['Expire Task']], 1]]],
      [5, 'Support / Trainer', null, 3, [[1949618253, [['garcia, ina dimaano'], ['tan, jay-anne ratunil']], 1]]],
    ],
  ],
])};</script>`

// Google's answer to a refused response, cut down from a real one: each question is a listitem whose
// alert holds the error. Project is flagged here; Task ID isn't.
const question = (title: string, error: string) =>
  `<div class="Qr7Oae" role="listitem"><div><span class="M7eMe">${title}</span><span class="vnumgf"> *</span></div>` +
  `<input type="text"/><div jsname="Rfh2Tc" class="SL4Sz" role="alert">` +
  (error ? `<div class="rRld8e"><div class="Y0xAIe" aria-hidden="true">&nbsp;</div></div><span class="RHiWt">${error}</span>` : '') +
  `</div></div>`
const REFUSED_PAGE =
  `<html><body><div role="list">${question('Task ID', '')}${question('Project:', 'This is a required question')}</div>` +
  `<div role="button" aria-label="Submit"><span class="NPEfkd">Submit</span></div></body></html>`

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

// The columns each table really has: PostgREST answers 400 for a select naming any other.
const COLUMNS: Record<string, string[]> = {
  task_submissions: ['id', 'task_id', 'cb_email', 'stage', 'status', 'backup_form_sent_at', 'backup_form_attempts', 'project:projects(name', 'code)'],
  profiles: ['id', 'role', 'lead_id', 'email', 'name', 'remotasks_id'],
  team_features: ['lead_id', 'backup_form_enabled', 'cts_trainer'],
}
function badSelect(url: string): boolean {
  const match = url.match(/\/rest\/v1\/(\w+)\?.*select=([^&]+)/)
  if (!match) return false
  const known = COLUMNS[match[1]]
  return !!known && decodeURIComponent(match[2]).split(',').some((column) => !known.includes(column))
}

function fakeFetch({
  sentAt = null as string | null,
  status = 'submitted',
  enabled = true,
  trainer = 'garcia, ina dimaano' as string | null,
  formStatus = 200,
  formPage = 'ok',
  attempts = 0,
  project = TASK.project as BackupFormTask['project'],
} = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (badSelect(url)) return Response.json({ code: '42703', message: 'column does not exist' }, { status: 400 })
    if (url.includes('/rest/v1/task_submissions?') && init?.method === 'PATCH') return new Response(null, { status: 204 })
    if (url.includes('/rest/v1/task_submissions?')) {
      return Response.json([{ id: 42, ...TASK, project, status, cb_email: 'cb_one@example.com', backup_form_sent_at: sentAt, backup_form_attempts: attempts }])
    }
    if (url.includes('/rest/v1/profiles?')) return Response.json([{ id: 'cb', role: 'contributor', lead_id: 'lead-1' }])
    if (url.includes('/rest/v1/team_features?')) return Response.json([{ backup_form_enabled: enabled, cts_trainer: trainer }])
    if (url === BACKUP_FORM_RESPONSE_URL) return new Response(formPage, { status: formStatus })
    if (url === BACKUP_FORM_VIEW_URL) return new Response(FORM_PAGE)
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

const posted = (fetchImpl: ReturnType<typeof fakeFetch>) => fetchImpl.mock.calls.find(([url]) => String(url) === BACKUP_FORM_RESPONSE_URL)
const patchBody = (fetchImpl: ReturnType<typeof fakeFetch>) =>
  JSON.parse(String(fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body))

describe('handleSendTaskToBackupForm', () => {
  it("posts the task with the CB's email and records it as sent", async () => {
    const fetchImpl = fakeFetch()
    expect((await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).status).toBe(200)
    expect(new URLSearchParams(String(posted(fetchImpl)?.[1]?.body)).get('entry.852481976')).toBe('cb_one@example.com')
    expect(patchBody(fetchImpl)).toMatchObject({ backup_form_error: null })
    expect(patchBody(fetchImpl).backup_form_sent_at).toBeTruthy()
  })

  it('escapes the email for the profile lookup', async () => {
    const fetchImpl = fakeFetch()
    await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes(`email=ilike.${encodeURIComponent('cb\\_one@example.com')}`))).toBe(true)
  })

  it("reports a failed lookup instead of treating it as the team having it off", async () => {
    const base = fakeFetch()
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
      String(input).includes('/rest/v1/profiles?') ? new Response('boom', { status: 500 }) : base(input, init),
    )
    const response = await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(response.status).toBe(500)
    expect((await response.json()).message).toContain('profiles')
    expect(posted(fetchImpl as unknown as ReturnType<typeof fakeFetch>)).toBeUndefined()
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

  it('says which answer the form refused: a trainer not in its list', async () => {
    const fetchImpl = fakeFetch({ formStatus: 400, trainer: 'garcia, ina' })
    await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(patchBody(fetchImpl).backup_form_error).toBe(
      'The trainer "garcia, ina" isn\'t one of the backup form\'s Support / Trainer choices. Fix it on the Leads page (CTS trainer) to match the form exactly.',
    )
  })

  it("doesn't post a task with no project, which the form requires, and says why", async () => {
    const fetchImpl = fakeFetch({ project: null })
    expect((await handleSendTaskToBackupForm(request(), ENV, fetchImpl)).status).toBe(502)
    expect(posted(fetchImpl)).toBeUndefined()
    expect(patchBody(fetchImpl).backup_form_error).toContain('no project')
  })

  it("records the question Google flagged and what was sent for it", async () => {
    const fetchImpl = fakeFetch({ formStatus: 400, formPage: REFUSED_PAGE })
    await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(patchBody(fetchImpl).backup_form_error).toBe('The Google Form refused Project "Ego Nexus": This is a required question')
  })

  it('says when the form is busy rather than refusing', async () => {
    const fetchImpl = fakeFetch({ formStatus: 429 })
    await handleSendTaskToBackupForm(request(), ENV, fetchImpl)
    expect(patchBody(fetchImpl).backup_form_error).toContain('429')
  })

  it('counts every try, sent or not, so the retry job can stop', async () => {
    const failed = fakeFetch({ formStatus: 500, attempts: 2 })
    await handleSendTaskToBackupForm(request(), ENV, failed)
    expect(patchBody(failed).backup_form_attempts).toBe(3)
    const sent = fakeFetch({ attempts: 3 })
    await handleSendTaskToBackupForm(request(), ENV, sent)
    expect(patchBody(sent).backup_form_attempts).toBe(4)
  })
})

describe('formChoices and explainRefusal', () => {
  const choices = formChoices(FORM_PAGE)!

  it("reads each choice field's options, leaving out fields that take Other", () => {
    expect(choices.get('entry.1949618253')).toEqual(['garcia, ina dimaano', 'tan, jay-anne ratunil'])
    expect(choices.get('entry.352893396')).toEqual(['Attempter', 'L0', 'L1'])
    expect(choices.has('entry.1090872663')).toBe(false)
  })

  it('finds nothing wrong with a body the form would take', () => {
    expect(explainRefusal(backupFormBody(TASK, 'cb@example.com', 'garcia, ina dimaano'), choices)).toBeNull()
  })

  it('names a level the form has no choice for', () => {
    expect(explainRefusal(backupFormBody({ ...TASK, stage: 'l2' }, 'cb@example.com', 'garcia, ina dimaano'), choices)).toBe(
      '"l2" isn\'t one of the backup form\'s Task Level choices.',
    )
  })

  it("returns null when the page isn't the form", () => {
    expect(formChoices('<html>Sign in</html>')).toBeNull()
  })
})

describe('refusedQuestions and describeRefusal', () => {
  it('reads only the flagged questions, not the submit button', () => {
    expect(refusedQuestions(REFUSED_PAGE)).toEqual([{ question: 'Project', message: 'This is a required question' }])
  })

  it('finds nothing on a page with no errors', () => {
    expect(refusedQuestions('<html>Your response has been recorded.</html>')).toEqual([])
  })

  it("shows a project sent as Other by the name that was typed in", () => {
    const body = backupFormBody({ ...TASK, project: { name: 'New Thing', code: null } }, 'cb@example.com', 'garcia, ina dimaano')
    expect(describeRefusal([{ question: 'Project', message: 'Bad' }], body)).toBe('The Google Form refused Project "New Thing": Bad')
  })
})
