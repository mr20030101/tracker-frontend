import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './api'
import { liveChannelName, useIsActive } from './idle'

// The menu's numbers for leads and admins (pending and overdue requests, feedback to check, task
// overlap alerts) used to poll every two minutes each, in every manager's tab. Now one live feed
// refreshes them the moment a row changes, and the polls are only a safety net for a missed event.
// Overdue still needs its poll: a request turns overdue with time, not with a change to its row.
// The tables must be in the supabase_realtime publication (20261118_manager_counts_live.sql).
export const MANAGER_COUNTS_POLL_MS = 5 * 60_000

// Many rows changing at once (a bulk review) refetch once, not once per row.
const DEBOUNCE_MS = 1000

const FEEDS = [
  { table: 'task_requests', queryKey: ['task-requests'] },
  { table: 'task_feedback', queryKey: ['task-feedback'] },
  { table: 'task_overlap_alerts', queryKey: ['task-overlap-alerts'] },
] as const

/**
 * Keeps the managers' counters current while the tab is in use. An idle tab drops the feed, and
 * React Query refetches what's stale when it wakes.
 */
export function useManagerCountsLive(enabled: boolean) {
  const queryClient = useQueryClient()
  const active = useIsActive()

  useEffect(() => {
    if (!enabled || !active) return
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    let channel = supabase.channel(liveChannelName('manager-counts-live'))
    for (const { table, queryKey } of FEEDS) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timers.get(table))
        timers.set(table, setTimeout(() => queryClient.invalidateQueries({ queryKey: [...queryKey] }), DEBOUNCE_MS))
      })
    }
    channel.subscribe()

    return () => {
      timers.forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  }, [enabled, active, queryClient])
}
