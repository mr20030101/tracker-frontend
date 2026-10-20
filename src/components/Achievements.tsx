import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Flame, Pin } from 'lucide-react'
import { badgeById, nextBadge, setFeaturedBadge, useAchievements, useFeaturedBadges, visibleBadges } from '../lib/achievements'
import type { Achievements } from '../types'
import { GrowBar } from './GrowBar'

// A contributor's pinned badge, as a small chip beside their name. Nothing when none is pinned.
export function FeaturedBadgeChip({ badgeId }: { badgeId: string | null | undefined }) {
  const badge = badgeById(badgeId)
  if (!badge) return null
  return (
    // A small copy of the featured pill on the Dashboard's badge card (AchievementsCard below).
    <span
      title={`${badge.label}: ${badge.description}`}
      className="badge-featured relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-full bg-linear-to-r from-accent to-[#f2c94c] py-0.5 pl-0.5 pr-2 text-[11px] font-bold text-accent-foreground shadow-[0_1px_6px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/35">
        <badge.icon className="h-2.5 w-2.5" />
      </span>
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
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[#f97316]/40 bg-linear-to-r from-[#f97316]/20 to-[#facc15]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#f97316]"
    >
      <Flame className="flame-flicker -mb-0.5 -ml-1.5 -mt-4 h-6 w-6 fill-[#facc15]/60" />
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
  const badges = visibleBadges(a)
  const earned = badges.filter((b) => b.earned(a)).length
  const next = nextBadge(a)

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="text-sm font-semibold text-gray-700">{title}</div>
        <div className="flex items-center gap-2">
          <Flame className={`h-6 w-6 ${a.current_streak ? 'flame-flicker fill-[#facc15]/60 text-orange-500' : 'text-gray-300'}`} />
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
          {earned} of {badges.length} badges
        </div>
      </div>
      {next && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5">
          <next.badge.icon className="h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">
                <span className="text-gray-500">Next up: </span>
                <span className="font-semibold text-gray-900">{next.badge.label}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-gray-500">
                {next.current.toLocaleString()} / {next.goal.toLocaleString()}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <GrowBar className="h-full rounded-full bg-accent" pct={(next.current / next.goal) * 100} />
            </div>
            <div className="mt-1 text-xs text-gray-400">{next.badge.description}</div>
          </div>
        </div>
      )}
      <ul className="flex flex-wrap gap-2">
        {badges.map((badge) => {
          const has = badge.earned(a)
          const progress = !has && badge.progress ? badge.progress(a) : undefined
          const isFeatured = badge.id === featuredId
          // Every chip has the same shape: the icon in a disc, then the name. The featured one is solid
          // gold, earned ones are tinted with their badge's colour, ones still to earn are grey.
          const chip = isFeatured
            ? 'badge-featured relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-linear-to-r from-accent to-[#f2c94c] py-1 pl-1 pr-1 text-xs font-bold text-accent-foreground shadow-[0_2px_10px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]'
            : `inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold ${
                has
                  ? 'border-[color-mix(in_srgb,var(--badge)_45%,transparent)] bg-[color-mix(in_srgb,var(--badge)_12%,transparent)] text-(--badge)'
                  : 'border-gray-200 text-gray-400'
              }`
          const disc = isFeatured
            ? 'bg-white/35'
            : has
              ? 'bg-(--badge) text-white'
              : 'bg-gray-100 text-gray-400'
          const content = (
            <>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${disc}`}>
                <badge.icon className="h-3 w-3" />
              </span>
              {badge.label}
              {progress && progress[1] > 0 && (
                <span className="font-medium text-gray-400">
                  {Math.min(progress[0], progress[1]).toLocaleString()}/{progress[1].toLocaleString()}
                </span>
              )}
              {isFeatured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-foreground/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f2c94c]">
                  <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                  Featured
                </span>
              )}
              <span className="sr-only">
                {has ? '(earned)' : '(not yet earned)'}
                {isFeatured ? ' (featured)' : ''}
              </span>
            </>
          )
          const style = { '--badge': badge.color } as React.CSSProperties
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
                  style={style}
                >
                  {content}
                </button>
              ) : (
                <span title={badge.description} className={chip} style={style}>
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
