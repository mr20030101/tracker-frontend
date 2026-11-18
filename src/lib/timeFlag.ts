// Task Log's "Time" filter: entries worth a second look.
export const SHORT_TASK_SECONDS = 2 * 60
export const LONG_TASK_SECONDS = 3 * 60 * 60

export type TimeFlag = '' | 'unusual' | 'short' | 'long'

export const TIME_FLAG_OPTIONS: { value: TimeFlag; label: string }[] = [
  { value: '', label: 'All Times' },
  { value: 'unusual', label: 'Unusual (too short or long)' },
  { value: 'short', label: 'Submitted under 2 min' },
  { value: 'long', label: '3 hours or more' },
]

/**
 * The PostgREST `or` filter for a time flag, or null for none. Too short: submitted with under
 * SHORT_TASK_SECONDS on a stopped timer. Too long: LONG_TASK_SECONDS banked, or a run going that long.
 */
export function timeFlagFilter(flag: TimeFlag, now = Date.now()): string | null {
  const short = `and(status.eq.submitted,timer_started_at.is.null,timer_elapsed_seconds.lt.${SHORT_TASK_SECONDS})`
  const runningSince = new Date(now - LONG_TASK_SECONDS * 1000).toISOString()
  const long = `timer_elapsed_seconds.gte.${LONG_TASK_SECONDS},timer_started_at.lt."${runningSince}"`
  if (flag === 'short') return short
  if (flag === 'long') return long
  if (flag === 'unusual') return `${short},${long}`
  return null
}
