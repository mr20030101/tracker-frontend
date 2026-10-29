const STAGE_LABELS = { attempt: 'Attempt', l0: 'L0', l1: 'L1' }
const REQUEST_STATUS = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  denied: { label: 'Denied', tone: 'danger' },
}
const REQUEST_HELP = {
  extension: 'More time on a task before it’s marked expired.',
  reclaim: 'Get a task back that was taken or expired.',
}
const REASON_PLACEHOLDERS = {
  extension: 'Why do you need more time?',
  reclaim: 'Why does this task need to be reclaimed?',
}
// Same as background.js: minutes a task has before it expires, from when it was started.
const EXPIRY_MINUTES = { attempt: 90, l1: 90, l0: 120 }

const $ = (id) => document.getElementById(id)

async function call(message) {
  const response = await chrome.runtime.sendMessage(message)
  if (!response?.ok) throw new Error(response?.error ?? 'Something went wrong.')
  return response.result
}

function showError(message) {
  $('error-text').textContent = message ?? ''
  $('error').hidden = !message
}

$('error-close').addEventListener('click', () => showError(null))

// Runs an action from a button or form: disables it meanwhile and shows what went wrong.
async function act(button, work) {
  showError(null)
  if (button) button.disabled = true
  try {
    await work()
    await refresh()
  } catch (err) {
    showError(err.message)
  } finally {
    if (button) button.disabled = false
  }
}

// Same format as the tracker (formatTimer in src/lib/taskTimer.ts): 75 -> '1:15', 3725 -> '1:02:05'.
function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function timerSeconds(row) {
  const banked = row.timer_elapsed_seconds ?? 0
  if (!row.timer_started_at) return banked
  return banked + Math.max(0, Math.floor((Date.now() - new Date(row.timer_started_at).getTime()) / 1000))
}

/** 4500 -> '1h 15m', 300 -> '5m'. */
function formatLeft(seconds) {
  const minutes = Math.ceil(seconds / 60)
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?'
}

function checkedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value
}

function setChecked(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`)
  if (input) input.checked = true
}

let state = null

function renderTask() {
  const current = state?.current
  const row = current?.row
  $('task').hidden = !row
  $('empty').hidden = Boolean(row)
  if (!row) return

  const inProgress = row.status === 'in_progress'
  const running = Boolean(row.timer_started_at)
  const status = !inProgress
    ? row.status === 'submitted'
      ? ['Submitted', 'pill-done']
      : row.status === 'expired'
        ? ['Expired', 'pill-expired']
        : [row.status, 'pill-paused']
    : running
      ? ['Recording', 'pill-recording']
      : ['Paused', 'pill-paused']
  $('task-status').textContent = status[0]
  $('task-status').className = `pill ${status[1]}`
  if ($('copy-task').textContent !== 'Copied') $('copy-task').textContent = current.taskId
  $('timer').textContent = formatTimer(timerSeconds(row))
  const project = state.projects?.find((p) => p.id === state.settings?.projectId)
  $('task-meta').textContent = [STAGE_LABELS[row.stage], current.created ? project?.name : null].filter(Boolean).join(' · ')

  // How long until it expires, from when it was started.
  $('expiry').hidden = !inProgress || !row.created_at
  if (inProgress && row.created_at) {
    const total = (EXPIRY_MINUTES[row.stage] ?? EXPIRY_MINUTES.attempt) * 60
    const left = total - (Date.now() - new Date(row.created_at).getTime()) / 1000
    $('expiry-fill').style.width = `${Math.min(100, Math.max(0, (1 - left / total) * 100))}%`
    $('expiry').classList.toggle('is-late', left <= 10 * 60)
    $('expiry-text').textContent = left > 0 ? `Expires in ${formatLeft(left)}` : 'Past its expiry time'
  }

  // The saved link, unless one is being typed: the field follows the tracker until it's edited.
  const screenshot = $('screenshot')
  const saved = row.snipboard_url ?? ''
  if (screenshot.dataset.row !== String(row.id) || screenshot.value === screenshot.dataset.saved) screenshot.value = saved
  screenshot.dataset.row = String(row.id)
  screenshot.dataset.saved = saved

  $('mark-submitted').hidden = !inProgress
  $('pause').hidden = !inProgress || !running
  $('resume').hidden = !inProgress || running
  $('reset').hidden = !$('reset-confirm').hidden
}

function render() {
  const signedIn = Boolean(state?.session && state.profile)
  $('sign-in-view').hidden = signedIn
  $('app-view').hidden = !signedIn
  if (!signedIn) return

  const { profile, projects = [], settings = {} } = state
  $('avatar').textContent = initials(profile.name ?? profile.email)
  $('name').textContent = profile.name ?? profile.email
  $('cb-email').textContent = profile.email
  $('remotasks-id').textContent = profile.remotasks_id ?? 'Not set'
  $('remotasks-id').title = profile.remotasks_id ?? ''
  $('no-remotasks-id').hidden = Boolean(profile.remotasks_id)

  const project = $('project')
  if (project.options.length !== projects.length + 1) {
    project.replaceChildren(new Option('Choose a project…', ''), ...projects.map((p) => new Option(p.name, String(p.id))))
  }
  if (document.activeElement !== project) project.value = settings.projectId ? String(settings.projectId) : ''
  setChecked('stage', settings.stage ?? 'attempt')

  $('request-task').placeholder = state.current?.taskId ?? 'Paste the task ID'
  renderTask()
}

// --- tabs ---------------------------------------------------------------------------------

function showTab(name) {
  for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name))
  $('tab-timer').hidden = name !== 'timer'
  $('tab-requests').hidden = name !== 'requests'
  if (name === 'requests') renderRequests()
}

for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => showTab(tab.dataset.tab))

// --- requests -----------------------------------------------------------------------------

// The request form's task: whatever's typed there, or else the current task.
function requestTaskId() {
  return $('request-task').value.trim() || state?.current?.taskId || ''
}

function renderRequestType() {
  const type = checkedValue('request-type')
  $('request-help').textContent = REQUEST_HELP[type]
  $('request-reason').placeholder = REASON_PLACEHOLDERS[type]
}

async function renderRequests() {
  const list = $('requests')
  const taskId = requestTaskId()
  const requests = taskId ? await call({ type: 'get-requests', taskId }).catch(() => []) : []
  if (requests.length === 0) {
    const li = document.createElement('li')
    li.className = 'list-empty'
    li.textContent = taskId ? 'No requests for this task yet.' : 'Start a task or paste a task ID above.'
    list.replaceChildren(li)
    return
  }
  list.replaceChildren(
    ...requests.map((r) => {
      const li = document.createElement('li')
      const main = document.createElement('div')
      main.className = 'list-main'
      const title = Object.assign(document.createElement('div'), {
        className: 'list-title',
        textContent: r.type === 'reclaim' ? 'Reclaim' : 'Extension',
      })
      const when = new Date(r.requested_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      const meta = Object.assign(document.createElement('div'), { className: 'muted small truncate', textContent: `${when} · ${r.reason ?? ''}` })
      main.append(title, meta)
      const status = REQUEST_STATUS[r.status] ?? { label: r.status, tone: 'neutral' }
      const pill = Object.assign(document.createElement('span'), { className: `pill pill-${status.tone}`, textContent: status.label })
      li.append(main, pill)
      return li
    }),
  )
}

// --- data ---------------------------------------------------------------------------------

async function refresh() {
  try {
    state = await call({ type: 'get-state' })
    render()
    if (!$('tab-requests').hidden) await renderRequests()
  } catch (err) {
    showError(err.message)
  }
}

// --- actions ------------------------------------------------------------------------------

$('sign-in').addEventListener('submit', (event) => {
  event.preventDefault()
  act(event.submitter, async () => {
    await call({ type: 'sign-in', email: $('email').value, password: $('password').value })
    $('password').value = ''
  })
})

$('sign-out').addEventListener('click', (event) => act(event.currentTarget, () => call({ type: 'sign-out' })))

// Clears a finished task (submitted, expired or gone from the tracker) and brings the rest up to date.
$('reload').addEventListener('click', (event) =>
  act(event.currentTarget, async () => {
    await call({ type: 'reload' })
    $('reset-confirm').hidden = true
  }),
)

function saveSettings() {
  const projectId = $('project').value ? Number($('project').value) : null
  act(null, () => call({ type: 'set-settings', settings: { projectId, stage: checkedValue('stage') } }))
}
$('project').addEventListener('change', saveSettings)
for (const input of document.querySelectorAll('input[name="stage"]')) input.addEventListener('change', saveSettings)

$('start').addEventListener('submit', (event) => {
  event.preventDefault()
  act($('start-button'), async () => {
    await call({ type: 'start', taskId: $('task-input').value })
    $('task-input').value = ''
  })
})

$('copy-task').addEventListener('click', async () => {
  const id = state?.current?.taskId
  if (!id) return
  await navigator.clipboard.writeText(id).catch(() => {})
  $('copy-task').textContent = 'Copied'
  setTimeout(() => {
    $('copy-task').textContent = id
  }, 1000)
})

$('screenshot-form').addEventListener('submit', (event) => {
  event.preventDefault()
  act($('screenshot-save'), () => call({ type: 'set-screenshot', screenshot: $('screenshot').value }))
})

// Submitted also saves the screenshot link typed in.
$('mark-submitted').addEventListener('click', (event) =>
  act(event.currentTarget, () => call({ type: 'mark-submitted', screenshot: $('screenshot').value })),
)
$('pause').addEventListener('click', (event) => act(event.currentTarget, () => call({ type: 'pause' })))
$('resume').addEventListener('click', (event) => act(event.currentTarget, () => call({ type: 'resume' })))

// Reset asks what to do with the task: take it out of the tracker (a wrong ID), or only stop
// showing it here, leaving it in the tracker with its timer paused.
$('reset').addEventListener('click', () => {
  const current = state?.current
  if (!current?.taskId) return
  const inProgress = current.row?.status === 'in_progress'
  $('reset-message').textContent = inProgress
    ? `Wrong task? Remove ${current.taskId} from the tracker (with any requests on it), or just clear it here and keep it in the tracker with its timer paused.`
    : `Clear ${current.taskId} from here? It stays in the tracker.`
  $('reset-remove').hidden = !inProgress
  $('reset-confirm').hidden = false
  $('reset').hidden = true
})

function closeResetConfirm() {
  $('reset-confirm').hidden = true
  renderTask()
}

$('reset-no').addEventListener('click', closeResetConfirm)

for (const [id, remove] of [
  ['reset-remove', true],
  ['reset-clear', false],
]) {
  $(id).addEventListener('click', (event) =>
    act(event.currentTarget, async () => {
      await call({ type: 'reset', remove })
      closeResetConfirm()
    }),
  )
}

for (const input of document.querySelectorAll('input[name="request-type"]')) input.addEventListener('change', renderRequestType)
$('request-task').addEventListener('change', renderRequests)

$('request').addEventListener('submit', (event) => {
  event.preventDefault()
  $('request-sent').hidden = true
  act(event.submitter, async () => {
    const taskId = requestTaskId()
    if (!taskId) throw new Error('Paste the task ID to request for.')
    await call({ type: 'send-request', taskId, requestType: checkedValue('request-type'), reason: $('request-reason').value })
    $('request-reason').value = ''
    $('request-sent').hidden = false
  })
})

renderRequestType()
refresh()
// The timer ticks here; the stored state is re-read now and then in case it changed in the tracker.
setInterval(() => state && renderTask(), 1000)
setInterval(refresh, 10000)
