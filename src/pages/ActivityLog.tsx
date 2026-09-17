import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ActivityEvent, ActivityLog } from '../types'
import { Avatar } from '../components/Avatar'

const EVENT_LABELS: Record<ActivityEvent, string> = {
  login: 'Signed in',
  login_failed: 'Sign-in failed',
  logout: 'Signed out',
}

const EVENT_STYLES: Record<ActivityEvent, string> = {
  login: 'bg-status-success-bg text-status-success-text',
  login_failed: 'bg-status-danger-bg text-status-danger-text',
  logout: 'bg-gray-100 text-gray-600',
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function ActivityLog() {
  const [eventFilter, setEventFilter] = useState<ActivityEvent | 'all'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => (await api.get<ActivityLog[]>('/activity-logs')).data,
    refetchInterval: 30_000,
  })

  const rows = useMemo(() => (data ?? []).filter((row) => eventFilter === 'all' || row.event === eventFilter), [data, eventFilter])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-sm text-gray-500">Sign-in and sign-out activity across all logins.</p>
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value as ActivityEvent | 'all')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="all">All events</option>
          <option value="login">Signed in</option>
          <option value="login_failed">Sign-in failed</option>
          <option value="logout">Signed out</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Event</th>
              <th className="px-5 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-gray-400">
                  No activity recorded yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={row.user?.name ?? row.email ?? 'Unknown'} size={28} />
                    <div>
                      <div className="font-medium text-gray-900">{row.user?.name ?? 'Unknown'}</div>
                      <div className="text-xs text-gray-400">{row.user?.email ?? row.email ?? '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${EVENT_STYLES[row.event]}`}>
                    {EVENT_LABELS[row.event]}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{formatTimestamp(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
