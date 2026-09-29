import { Flame } from 'lucide-react'
import { BADGES, useAchievements } from '../lib/achievements'
import type { Achievements } from '../types'

// "🔥 3" next to a name: weeks in a row at or above target. Nothing for no streak.
export function StreakChip({ streak }: { streak: number | undefined }) {
  if (!streak) return null
  return (
    <span
      title={`Hit the weekly target ${streak} week${streak === 1 ? '' : 's'} in a row`}
      className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[11px] font-bold text-orange-600"
    >
      <Flame className="h-3 w-3" />
      {streak}
    </span>
  )
}

export function AchievementsCard({ userId, title = 'Achievements' }: { userId: string; title?: string }) {
  const { data } = useAchievements([userId])
  const a: Achievements | undefined = data?.get(userId)
  if (!a) return null
  const earned = BADGES.filter((b) => b.earned(a)).length

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="text-sm font-semibold text-gray-700">{title}</div>
        <div className="flex items-center gap-2">
          <Flame className={`h-6 w-6 ${a.current_streak ? 'text-orange-500' : 'text-gray-300'}`} />
          <div>
            <div className="text-lg font-bold leading-tight text-gray-900">
              {a.current_streak} week{a.current_streak === 1 ? '' : 's'}
            </div>
            <div className="text-xs text-gray-400">current streak</div>
          </div>
        </div>
        <div>
          <div className="text-lg font-bold leading-tight text-gray-900">{a.best_streak}</div>
          <div className="text-xs text-gray-400">best streak</div>
        </div>
        <div>
          <div className="text-lg font-bold leading-tight text-gray-900">{a.weeks_hit}</div>
          <div className="text-xs text-gray-400">weeks on target</div>
        </div>
        <div className="ml-auto text-xs text-gray-400">
          {earned} of {BADGES.length} badges
        </div>
      </div>
      <ul className="flex flex-wrap gap-2">
        {BADGES.map((badge) => {
          const has = badge.earned(a)
          return (
            <li
              key={badge.id}
              title={badge.description}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                has ? badge.tone : 'border-gray-200 bg-gray-50 text-gray-300'
              }`}
            >
              <badge.icon className="h-3.5 w-3.5" />
              {badge.label}
              <span className="sr-only">{has ? '(earned)' : '(not yet earned)'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
