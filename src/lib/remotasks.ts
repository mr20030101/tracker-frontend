const DIFF_VIEWER_BASE_URL = 'https://www.remotasks.com/lidarlite/'

export function remotasksDiffViewerUrl(taskId: string): string {
  const params = new URLSearchParams({ entrypoint: 'diff-viewer', sceneId: taskId })
  return `${DIFF_VIEWER_BASE_URL}?${params.toString()}`
}

const REMOTASKS_ID_PATTERN = /^[0-9a-f]{24}$/i

/**
 * A Remotasks worker ID is 24 characters of 0-9 and a-f (e.g. 60e818c8f76af4001e9901d6); returns it
 * trimmed and lower-cased, or null when it isn't one (so "N/A", a name, or a typo'd length is
 * rejected). The database checks the same format (set_own_remotasks_id, update_own_profile,
 * task_requests.remotasks_id).
 */
export function normalizeRemotasksId(input: string): string | null {
  const trimmed = input.trim()
  return REMOTASKS_ID_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null
}

export function isValidRemotasksId(value: string | null | undefined): boolean {
  return value != null && normalizeRemotasksId(value) !== null
}

/** Why an entered ID isn't accepted, or null when it is. */
export function remotasksIdError(value: string): string | null {
  const id = value.trim()
  if (id === '') return 'Enter your Remotask ID.'
  if (!/^[0-9a-f]*$/i.test(id)) return 'A Remotask ID only has the digits 0-9 and the letters a-f.'
  if (id.length !== 24) return `A Remotask ID is 24 characters long; this one is ${id.length}.`
  return null
}
