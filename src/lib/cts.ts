import type { TaskSubmission } from '../types'

// Only finished work goes on the CTS Form: not tasks still in progress, empty, rejected/SBQ or expired.
const NOT_FOR_CTS = new Set(['in_progress', 'empty', 'rejected', 'expired'])

export function goesToCts(status: TaskSubmission['status']): boolean {
  return !NOT_FOR_CTS.has(status)
}
