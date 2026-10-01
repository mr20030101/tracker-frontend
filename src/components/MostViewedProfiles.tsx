import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useMostViewedProfiles } from '../lib/profileViews'
import { startOfMonth, startOfWeek, toISODate } from '../lib/week'
import { contributorPathById } from '../lib/urlRef'
import { Avatar } from './Avatar'
import { GrowBar } from './GrowBar'
import { Reveal } from './Reveal'

const MEDALS = ['🥇', '🥈', '🥉']

type Period = 'week' | 'month' | 'all'

const PERIOD_LABEL: Record<Period, string> = { week: 'This Week', month: 'This Month', all: 'All Time' }

// "Most famous": the contributors whose profiles teammates open most (one view per person per day).
export function MostViewedProfiles() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('week')
  const since = useMemo(() => {
    if (period === 'week') return toISODate(startOfWeek(new Date()))
    if (period === 'month') return toISODate(startOfMonth(new Date()))
    return null
  }, [period])
  const { data, isLoading, isError } = useMostViewedProfiles(since)
  const rows = data ?? []
  const top = rows[0]?.views ?? 0

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Eye className="h-5 w-5 text-accent" />
            Most famous
          </h2>
          <p className="text-sm text-gray-500">Whose profile teammates visit the most. One visit per person per day counts.</p>
        </div>
        <div className="flex w-fit rounded-lg border border-gray-200 bg-white p-1">
          {(['week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${period === p ? 'bg-accent text-accent-foreground' : 'text-gray-600'}`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading && <div className="px-5 py-6 text-center text-gray-400">Loading...</div>}
        {isError && <div className="px-5 py-6 text-center text-status-danger-text">Could not load profile views.</div>}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="px-5 py-6 text-center text-gray-400">No profile visits yet. Go say hi to a teammate!</div>
        )}
        {rows.length > 0 && (
          <Reveal as="ul" className="divide-y divide-gray-100" step={45}>
            {rows.map((row, index) => {
              const isMe = row.user_id === user?.id
              return (
                <li key={row.user_id}>
                  <Link
                    to={contributorPathById(row.user_id)}
                    className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 ${isMe ? 'bg-accent-bg/40' : ''}`}
                  >
                    <span className="w-8 shrink-0 text-center text-lg font-semibold text-gray-400">{MEDALS[index] ?? index + 1}</span>
                    <Avatar name={row.name} photoUrl={row.avatar_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {row.name}
                        {isMe && <span className="ml-2 text-xs font-semibold text-accent">You</span>}
                      </div>
                      <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
                        <GrowBar className="h-full rounded-full bg-accent" pct={top ? Math.round((row.views / top) * 100) : 0} delay={300 + index * 45} />
                      </div>
                    </div>
                    <span className="shrink-0 text-right text-sm font-semibold text-gray-900">
                      {row.views.toLocaleString()} <span className="font-normal text-gray-400">{row.views === 1 ? 'view' : 'views'}</span>
                      <span className="block text-xs font-normal text-gray-400">
                        {row.viewers} {row.viewers === 1 ? 'person' : 'people'}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </Reveal>
        )}
      </div>
    </section>
  )
}
