// Signs in to Grey Owls Tracker and logs the Remotasks task you paste in: Start logs it as In
// Progress with its timer running, and Submitted marks it so, which stops the timer. The times are
// kept by the database (task_submissions_timer in supabase/migrations/20261024_task_timers.sql),
// so this only sets the status and starts or pauses the timer. Nothing is read from Remotasks.

// The same public project URL and anon key the tracker's own pages use (src/lib/supabaseConfig.ts).
const SUPABASE_URL = 'https://ieovepkcseytccagzedg.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imllb3ZlcGtjc2V5dGNjYWd6ZWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjU1NDUsImV4cCI6MjEwNDc0MTU0NX0.OMZEAONl3XoSwjb_RhYo70fYXThONXVBGQLlGF-OQ7s'

const SUBMISSION_FIELDS = 'id,task_id,user_id,stage,status,snipboard_url,created_at,timer_started_at,timer_elapsed_seconds'
// Refresh the sign-in this long before it runs out.
const REFRESH_MARGIN_S = 60
// How long a task has before it expires, by stage, counted from when it was started here.
const EXPIRY_MINUTES = { attempt: 90, l1: 90, l0: 120 }
// When each task's alarm goes off, in minutes after it was started.
function alarmPoints(stage) {
  const expiry = EXPIRY_MINUTES[stage] ?? EXPIRY_MINUTES.attempt
  return [
    { key: '30m', at: 30, title: '30 minutes on this task' },
    { key: '1h', at: 60, title: '1 hour on this task' },
    { key: 'expiring', at: expiry - 10, title: '10 minutes before this task expires' },
  ]
}

// A Remotasks task ID: 24 characters of 0-9 and a-f (as in src/lib/remotasks.ts).
const TASK_ID_PATTERN = /^[0-9a-f]{24}$/i

// --- storage ---------------------------------------------------------------------------------

async function load(key) {
  return (await chrome.storage.local.get(key))[key] ?? null
}

async function save(values) {
  await chrome.storage.local.set(values)
}

// --- Supabase --------------------------------------------------------------------------------

async function authRequest(grantType, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Could not sign in.')
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at, userId: data.user.id }
}

async function accessToken() {
  const session = await load('session')
  if (!session) throw new Error('Sign in to Grey Owls Tracker first.')
  if (session.expiresAt - REFRESH_MARGIN_S > Date.now() / 1000) return session.accessToken
  try {
    const refreshed = await authRequest('refresh_token', { refresh_token: session.refreshToken })
    await save({ session: refreshed })
    return refreshed.accessToken
  } catch {
    await signOut()
    throw new Error('Your sign-in ran out. Sign in again.')
  }
}

async function rest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = new Error(data?.message || `The tracker said ${res.status}.`)
    error.code = data?.code
    throw error
  }
  return data
}

// --- account ---------------------------------------------------------------------------------

async function signIn(email, password) {
  const session = await authRequest('password', { email: email.trim(), password })
  await save({ session })
  await loadAccount(session.userId)
}

// Your profile and the projects to choose from, fresh from the tracker.
async function loadAccount(userId) {
  const [profile] = await rest(`profiles?id=eq.${userId}&select=id,name,email,role,remotasks_id`)
  if (!profile) throw new Error('No tracker profile found for this account.')
  // Only the projects they hold a level on, falling back to every project.
  const levels = await rest(`contributor_project_levels?user_id=eq.${userId}&select=project_id,projects(id,name)`)
  let projects = levels.map((l) => l.projects).filter(Boolean)
  if (projects.length === 0) projects = await rest('projects?select=id,name&order=name')
  projects.sort((a, b) => a.name.localeCompare(b.name))
  const settings = (await load('settings')) ?? {}
  if (!projects.some((p) => p.id === settings.projectId)) settings.projectId = projects.length === 1 ? projects[0].id : null
  await save({ profile, projects, settings: { stage: 'attempt', ...settings } })
}

// Reload: everything fresh from the tracker. A task that's done (submitted, expired, or no longer
// in the tracker) is cleared from here, ready for the next; one still in progress stays, as the
// tracker has it now.
async function reload() {
  const session = await load('session')
  if (!session) throw new Error('Sign in to Grey Owls Tracker first.')
  await loadAccount(session.userId)
  const [current, profile] = await Promise.all([load('current'), load('profile')])
  if (current?.taskId) {
    const { row } = await findOwnRow(current.taskId, profile.id)
    if (row?.status === 'in_progress') {
      await save({ current: { ...current, row } })
    } else {
      if (current.row) await clearAlarms(current.row.id)
      await save({ current: null })
    }
  }
  await updateBadge()
}

async function signOut() {
  await clearAllAlarms()
  await chrome.storage.local.remove(['session', 'profile', 'projects', 'current'])
  await updateBadge()
}

// --- tasks -----------------------------------------------------------------------------------

// The tracker dates tasks in Singapore time (toISODate in src/lib/week.ts).
function todaySG() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
}

/** The task ID in what was pasted: the ID itself, or a task link with it as ?sceneId=. */
function parseTaskId(input) {
  const text = String(input ?? '').trim()
  if (TASK_ID_PATTERN.test(text)) return text.toLowerCase()
  try {
    const id = new URL(text).searchParams.get('sceneId')
    if (id && TASK_ID_PATTERN.test(id)) return id.toLowerCase()
  } catch {
    // Not a link either.
  }
  return null
}

// The task being timed. `created` says whether the extension logged it (rather than it being
// logged before), which Reset needs to know.
async function setCurrent(taskId, row, created = false) {
  await save({ current: { taskId, row, created } })
  await updateBadge()
}

async function findOwnRow(taskId, userId) {
  const [row] = await rest(`task_submissions?task_id=eq.${taskId}&select=${SUBMISSION_FIELDS}`)
  if (row && row.user_id !== userId) return { taken: true }
  return { row }
}

async function setTimer(id, running) {
  const [row] = await rest(`task_submissions?id=eq.${id}&select=${SUBMISSION_FIELDS}`, {
    method: 'PATCH',
    // Any value starts it: the database replaces it with its own time.
    body: { timer_started_at: running ? new Date().toISOString() : null },
  })
  return row
}

// Logs the task as In Progress with its timer running, or picks the timer back up on one already
// logged. Starting one pauses any other timer you have running (the database runs one at a time).
async function start(input) {
  const [profile, settings, current] = await Promise.all([load('profile'), load('settings'), load('current')])
  if (!profile) throw new Error('Sign in to Grey Owls Tracker first.')
  const taskId = parseTaskId(input)
  if (!taskId) throw new Error('That isn’t a task ID. A task ID is 24 characters of 0-9 and a-f.')
  if (!settings?.projectId) throw new Error('Pick your project first.')

  const found = await findOwnRow(taskId, profile.id)
  if (found.taken) throw new Error('Someone else already logged this task ID.')
  let row = found.row
  // Starting the same task again keeps knowing the extension logged it.
  const created = !row || (current?.taskId === taskId && Boolean(current.created))
  if (row) {
    if (row.status !== 'in_progress') throw new Error('You already logged this task, and it isn’t in progress any more.')
    if (!row.timer_started_at) row = await setTimer(row.id, true)
  } else {
    try {
      ;[row] = await rest(`task_submissions?select=${SUBMISSION_FIELDS}`, {
        method: 'POST',
        body: {
          cb_email: profile.email,
          user_id: profile.id,
          task_id: taskId,
          project_id: settings.projectId,
          stage: settings.stage,
          status: 'in_progress',
          date: todaySG(),
          timer_started_at: new Date().toISOString(),
        },
      })
    } catch (err) {
      if (err.code === '23505') throw new Error('Someone else already logged this task ID.')
      throw err
    }
  }
  await setCurrent(taskId, row, created)
  await scheduleAlarms(row)
}

async function pauseOrResume(running) {
  const current = await load('current')
  if (!current?.row) return
  const row = await setTimer(current.row.id, running)
  await save({ current: { ...current, row } })
  await updateBadge()
}

/** The screenshot link as the tracker stores it: an http(s) link, or null for none. */
function parseScreenshotUrl(input) {
  const text = String(input ?? '').trim()
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol === 'http:' || url.protocol === 'https:') return text
  } catch {
    // Not a link.
  }
  throw new Error('The screenshot link should start with https://.')
}

// Saves the screenshot link on the current task (the Screenshot link on the tracker's form).
async function setScreenshot(input) {
  const current = await load('current')
  if (!current?.row) return
  const [row] = await rest(`task_submissions?id=eq.${current.row.id}&select=${SUBMISSION_FIELDS}`, {
    method: 'PATCH',
    body: { snipboard_url: parseScreenshotUrl(input) },
  })
  if (!row) throw new Error('This task isn’t in the tracker any more.')
  await save({ current: { ...current, row } })
}

// Marks it Submitted, which stops its timer, with the screenshot link if one was given.
async function markSubmitted(screenshot) {
  const current = await load('current')
  if (!current?.row) return
  const body = { status: 'submitted', submitted_at: todaySG() }
  if (screenshot !== undefined) body.snipboard_url = parseScreenshotUrl(screenshot)
  const [row] = await rest(`task_submissions?id=eq.${current.row.id}&status=eq.in_progress&select=${SUBMISSION_FIELDS}`, {
    method: 'PATCH',
    body,
  })
  // Nothing comes back when it wasn't in progress any more (submitted or changed in the tracker).
  if (!row) throw new Error('This task isn’t in progress in the tracker any more.')
  await clearAlarms(row.id)
  await save({ current: { ...current, row } })
  await updateBadge()
}

// For a wrong task ID: clears the current task, so the right one can be started. With `remove`
// it's also taken out of the tracker (only while it's still in progress); without, it stays there
// with its timer paused. Goes by the task as the tracker has it now, not as it was last seen here.
async function reset(remove) {
  const [current, profile] = await Promise.all([load('current'), load('profile')])
  if (current?.taskId && profile) {
    const { row } = await findOwnRow(current.taskId, profile.id)
    if (row && remove) {
      if (row.status !== 'in_progress') {
        throw new Error('Only a task that’s still in progress can be removed here. Change it on your Submissions in the tracker.')
      }
      const removed = await rest(`task_submissions?id=eq.${row.id}&status=eq.in_progress`, { method: 'DELETE' })
      // The tracker answers with what it removed; nothing means it wasn't allowed to.
      if (!removed?.length) throw new Error('The tracker didn’t remove this task. Remove it on your Submissions in the tracker.')
    } else if (row?.timer_started_at) {
      await setTimer(row.id, false)
    }
    if (row) await clearAlarms(row.id)
  }
  await save({ current: null })
  await updateBadge()
}

// --- requests ------------------------------------------------------------------------------

// Extension and reclaim requests, as on the tracker's Submissions table: for your own task while
// it's in progress or expired, with a reason, and only during your lead's shift (the database
// checks the same: task_requests_within_lead_shift).
const REQUESTABLE_STATUSES = ['in_progress', 'expired']

function sgMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  return get('hour') * 60 + get('minute')
}

function inShift({ starts_min: starts, ends_min: ends }) {
  const now = sgMinutesNow()
  return starts < ends ? now >= starts && now < ends : now >= starts || now < ends
}

function timeLabel(minutes) {
  const h = Math.floor(minutes / 60)
  const m = String(minutes % 60).padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

async function requestableRow(input) {
  const profile = await load('profile')
  if (!profile) throw new Error('Sign in to Grey Owls Tracker first.')
  const taskId = parseTaskId(input)
  if (!taskId) throw new Error('That isn’t a task ID. A task ID is 24 characters of 0-9 and a-f.')
  const found = await findOwnRow(taskId, profile.id)
  if (found.taken) throw new Error('This task was logged by someone else.')
  if (!found.row) throw new Error('This task isn’t in the tracker yet. Start it first.')
  return { profile, row: found.row }
}

/** Your requests on a task, newest first. */
async function taskRequests(input) {
  const taskId = parseTaskId(input)
  const profile = await load('profile')
  if (!taskId || !profile) return []
  const found = await findOwnRow(taskId, profile.id)
  if (!found.row) return []
  return rest(`task_requests?task_submission_id=eq.${found.row.id}&type=in.(extension,reclaim)&select=id,type,status,reason,requested_at&order=requested_at.desc`)
}

async function sendRequest(input, type, reason) {
  if (!['extension', 'reclaim'].includes(type)) throw new Error('Choose Extension or Reclaim.')
  if (!String(reason ?? '').trim()) throw new Error('Give a reason.')
  const { profile, row } = await requestableRow(input)
  if (!REQUESTABLE_STATUSES.includes(row.status)) throw new Error('Requests are only for tasks that are in progress or expired.')
  const [shift] = await rest('rpc/request_shift', { method: 'POST', body: {} })
  if (shift && !inShift(shift)) {
    throw new Error(`Extension and reclaim requests open during ${shift.lead_name}'s shift, ${timeLabel(shift.starts_min)} – ${timeLabel(shift.ends_min)}.`)
  }
  await rest('task_requests', {
    method: 'POST',
    body: {
      type,
      task_submission_id: row.id,
      requested_by: profile.id,
      reason: reason.trim(),
      remotasks_id: profile.remotasks_id ?? null,
    },
  })
}

// --- alarms --------------------------------------------------------------------------------

// Each task's alarms are named task:<submission id>:<task id>:<point>, so they survive the browser
// closing the background script and can be cleared together.
function alarmPrefix(submissionId) {
  return `task:${submissionId}:`
}

async function scheduleAlarms(row) {
  if (row.status !== 'in_progress' || !row.created_at) return
  const startedAt = new Date(row.created_at).getTime()
  for (const point of alarmPoints(row.stage)) {
    const when = startedAt + point.at * 60_000
    if (when > Date.now()) chrome.alarms.create(`${alarmPrefix(row.id)}${row.task_id}:${point.key}`, { when })
  }
}

async function clearAlarms(submissionId) {
  const alarms = await chrome.alarms.getAll()
  await Promise.all(alarms.filter((a) => a.name.startsWith(alarmPrefix(submissionId))).map((a) => chrome.alarms.clear(a.name)))
}

async function clearAllAlarms() {
  const alarms = await chrome.alarms.getAll()
  await Promise.all(alarms.filter((a) => a.name.startsWith('task:')).map((a) => chrome.alarms.clear(a.name)))
}

function clockLabel(time) {
  return new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

async function onAlarm(name) {
  const [, submissionId, taskId, key] = name.split(':')
  // Only while it's still in progress: one submitted or changed in the tracker meanwhile stays quiet.
  const [row] = await rest(`task_submissions?id=eq.${submissionId}&select=${SUBMISSION_FIELDS}`)
  if (row?.status !== 'in_progress') return
  const point = alarmPoints(row.stage).find((p) => p.key === key)
  if (!point) return
  const expiresAt = new Date(row.created_at).getTime() + (EXPIRY_MINUTES[row.stage] ?? EXPIRY_MINUTES.attempt) * 60_000
  chrome.notifications.create(name, {
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: point.title,
    message: `Task ${taskId}\nExpires at ${clockLabel(expiresAt)}.`,
    priority: 2,
    // The last one stays up until it's dismissed.
    requireInteraction: key === 'expiring',
  })
  await playAlarmSound()
}

// A background script can't play sound itself, so an offscreen page does.
async function playAlarmSound() {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Plays the task alarm.',
      })
    }
    await chrome.runtime.sendMessage({ type: 'play-alarm', target: 'offscreen' })
  } catch {
    // The notification still shows without the sound.
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('task:')) onAlarm(alarm.name).catch(() => {})
})

async function updateBadge() {
  const current = await load('current')
  await chrome.action.setBadgeText({ text: current?.row?.timer_started_at ? 'REC' : '' })
  await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' })
}

// --- messages --------------------------------------------------------------------------------

// One at a time, so a double click can't log a task twice.
let queue = Promise.resolve()
function serially(work) {
  const next = queue.then(work, work)
  queue = next.catch(() => {})
  return next
}

async function handle(message) {
  switch (message.type) {
    case 'sign-in':
      return signIn(message.email, message.password)
    case 'sign-out':
      return signOut()
    case 'set-settings': {
      const settings = { ...((await load('settings')) ?? {}), ...message.settings }
      await save({ settings })
      return
    }
    case 'start':
      return start(message.taskId)
    case 'pause':
      return pauseOrResume(false)
    case 'resume':
      return pauseOrResume(true)
    case 'mark-submitted':
      return markSubmitted(message.screenshot)
    case 'set-screenshot':
      return setScreenshot(message.screenshot)
    case 'reload':
      return reload()
    case 'reset':
      return reset(Boolean(message.remove))
    case 'get-requests':
      return taskRequests(message.taskId)
    case 'send-request':
      return sendRequest(message.taskId, message.requestType, message.reason)
    case 'get-state': {
      const data = await chrome.storage.local.get(['session', 'profile', 'projects', 'settings', 'current'])
      return { ...data, session: Boolean(data.session) }
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  serially(() => handle(message))
    .then((result) => reply({ ok: true, result }))
    .catch((err) => {
      // Also in the extension's console (brave://extensions → Inspect views: service worker).
      console.error(`Grey Owls Tracker: ${message.type} failed`, err)
      reply({ ok: false, error: err instanceof Error ? err.message : String(err) })
    })
  return true
})
