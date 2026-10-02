import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Flame, Pin } from 'lucide-react'
import { BADGES, badgeById, setFeaturedBadge, useAchievements, useFeaturedBadges } from '../lib/achievements'
import type { Achievements } from '../types'

// A contributor's pinned badge, as a small chip beside their name. Nothing when none is pinned.
export function FeaturedBadgeChip({ badgeId }: { badgeId: string | null | undefined }) {
  const badge = badgeById(badgeId)
  if (!badge) return null
  return (
    <span
      title={`${badge.label}: ${badge.description}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}
    >
      <badge.icon className="h-3 w-3" />
      {badge.label}
    </span>
  )
}

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

// `canFeature`: the card is the viewer's own, so clicking an earned badge pins it beside their
// name (clicking the pinned one again unpins it).
export function AchievementsCard({
  userId,
  title = 'Achievements',
  canFeature = false,
}: {
  userId: string
  title?: string
  canFeature?: boolean
}) {
  const queryClient = useQueryClient()
  const { data } = useAchievements([userId])
  const { data: featured } = useFeaturedBadges([userId])
  const featuredId = featured?.get(userId) ?? null
  const feature = useMutation({
    mutationFn: setFeaturedBadge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['featured-badges'] }),
  })

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
          const isFeatured = badge.id === featuredId
          const chip = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            has ? badge.tone : 'border-gray-200 bg-gray-50 text-gray-300'
          } ${isFeatured ? 'ring-2 ring-accent ring-offset-1' : ''}`
          const content = (
            <>
              <badge.icon className="h-3.5 w-3.5" />
              {badge.label}
              {isFeatured && <Pin className="h-3 w-3" aria-hidden="true" />}
              <span className="sr-only">
                {has ? '(earned)' : '(not yet earned)'}
                {isFeatured ? ' (featured)' : ''}
              </span>
            </>
          )
          return (
            <li key={badge.id}>
              {canFeature && has ? (
                <button
                  type="button"
                  title={isFeatured ? 'Featured beside your name. Click to unpin.' : `${badge.description} Click to feature it beside your name.`}
                  aria-pressed={isFeatured}
                  disabled={feature.isPending}
                  onClick={() => feature.mutate(isFeatured ? null : badge.id)}
                  className={`${chip} transition-transform hover:scale-105 disabled:opacity-60`}
                >
                  {content}
                </button>
              ) : (
                <span title={badge.description} className={chip}>
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {canFeature && earned > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          {featuredId ? 'Your featured badge shows beside your name.' : 'Click a badge you’ve earned to feature it beside your name.'}
        </p>
      )}
      {feature.isError && <p className="mt-2 text-xs text-red-600">{(feature.error as Error).message}</p>}
    </div>
  )
}
