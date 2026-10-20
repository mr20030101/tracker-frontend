import { useQuery } from '@tanstack/react-query'
import { Award, Crown, Flame, Ghost, Medal, Rocket, Sparkles, Target, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import { supabase } from './api'
import type { Achievements } from '../types'

export async function fetchAchievements(userIds: string[]): Promise<Achievements[]> {
  if (userIds.length === 0) return []
  const { data, error } = await supabase.rpc('contributor_achievements', { p_user_ids: userIds })
  if (error) throw error
  return ((data ?? []) as Achievements[]).map((row) => ({
    ...row,
    total_submitted: Number(row.total_submitted),
    best_week: Number(row.best_week),
    // Absent until the 20261013_motivation migration is applied: no new badges rather than NaN.
    personal_bests: Number(row.personal_bests ?? 0),
    spooky_seasons: Number(row.spooky_seasons ?? 0),
    october_weeks_hit: Number(row.october_weeks_hit ?? 0),
    october_weeks: Number(row.october_weeks ?? 0),
  }))
}

// Keyed by user id. Sorted into the key so the same people in another order share the cache.
export function useAchievements(userIds: string[]) {
  const ids = [...userIds].sort()
  return useQuery({
    queryKey: ['achievements', ids],
    queryFn: async () => new Map((await fetchAchievements(ids)).map((a) => [a.user_id, a])),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

export interface Badge {
  id: string
  label: string
  description: string
  icon: LucideIcon
  // The badge's own colour: an earned chip is tinted with it (mid-shades, readable on light and dark).
  color: string
  earned: (a: Achievements) => boolean
  /** How far along a not-yet-earned badge is, as [so far, needed]. Omitted when there's nothing to count. */
  progress?: (a: Achievements) => [number, number]
  /** A limited-time badge: listed only in this month (0 = January), or once earned. */
  month?: number
}

// Worked out from the rollups above, so a new badge needs no database change.
export const BADGES: Badge[] = [
  {
    id: 'first-task',
    label: 'First Task',
    description: 'Submitted a first task.',
    icon: Sparkles,
    color: '#0ea5e9',
    earned: (a) => a.total_submitted >= 1,
    progress: (a) => [a.total_submitted, 1],
  },
  {
    id: 'target-hit',
    label: 'On Target',
    description: 'Hit a weekly target.',
    icon: Target,
    color: '#10b981',
    earned: (a) => a.weeks_hit >= 1,
  },
  {
    id: 'streak-3',
    label: 'On a Roll',
    description: 'Hit the target 3 weeks in a row.',
    icon: Flame,
    color: '#f97316',
    earned: (a) => a.best_streak >= 3,
    progress: (a) => [a.current_streak, 3],
  },
  {
    id: 'streak-10',
    label: 'Unstoppable',
    description: 'Hit the target 10 weeks in a row.',
    icon: Zap,
    color: '#f59e0b',
    earned: (a) => a.best_streak >= 10,
    progress: (a) => [a.current_streak, 10],
  },
  {
    id: 'club-100',
    label: '100 Club',
    description: 'Submitted 100 tasks.',
    icon: Medal,
    color: '#8b5cf6',
    earned: (a) => a.total_submitted >= 100,
    progress: (a) => [a.total_submitted, 100],
  },
  {
    id: 'club-500',
    label: '500 Club',
    description: 'Submitted 500 tasks.',
    icon: Award,
    color: '#d946ef',
    earned: (a) => a.total_submitted >= 500,
    progress: (a) => [a.total_submitted, 500],
  },
  {
    id: 'club-1000',
    label: '1,000 Club',
    description: 'Submitted 1,000 tasks.',
    icon: Crown,
    color: '#ca8a04',
    earned: (a) => a.total_submitted >= 1000,
    progress: (a) => [a.total_submitted, 1000],
  },
  {
    id: 'big-week',
    label: 'Big Week',
    description: 'Submitted 100 tasks in a single week.',
    icon: Rocket,
    color: '#f43f5e',
    earned: (a) => a.best_week >= 100,
    progress: (a) => [a.best_week, 100],
  },
  {
    id: 'personal-best',
    label: 'Personal Best',
    description: 'Beat your own best week (after your first 4 weeks).',
    icon: TrendingUp,
    color: '#14b8a6',
    earned: (a) => a.personal_bests >= 1,
  },
  {
    id: 'spooky-season',
    label: 'Spooky Season',
    description: 'Hit the weekly target every week of October. October only!',
    icon: Ghost,
    color: '#ea580c',
    earned: (a) => a.spooky_seasons >= 1,
    progress: (a) => [a.october_weeks_hit, a.october_weeks],
    month: 9,
  },
]

/** The badges to list right now: everything, except a limited-time one outside its month that isn't earned. */
export function visibleBadges(a: Achievements, now = new Date()): Badge[] {
  return BADGES.filter((badge) => badge.month === undefined || badge.month === now.getMonth() || badge.earned(a))
}

/** The not-yet-earned badge closest to done, for "Next up". Undefined when nothing has progress to show. */
export function nextBadge(a: Achievements, now = new Date()): { badge: Badge; current: number; goal: number } | undefined {
  let best: { badge: Badge; current: number; goal: number } | undefined
  for (const badge of visibleBadges(a, now)) {
    if (badge.earned(a) || !badge.progress) continue
    const [current, goal] = badge.progress(a)
    if (goal <= 0) continue
    if (!best || current / goal > best.current / best.goal) best = { badge, current: Math.min(current, goal), goal }
  }
  return best
}

export function badgeById(id: string | null | undefined): Badge | undefined {
  return id ? BADGES.find((badge) => badge.id === id) : undefined
}

// Featured badge (supabase/migrations/20261002_featured_badge.sql): one earned badge a
// contributor pins, shown next to their name. Keyed by user id, like useAchievements.
export function useFeaturedBadges(userIds: string[]) {
  const ids = [...userIds].sort()
  return useQuery({
    queryKey: ['featured-badges', ids],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('featured_badges', { p_user_ids: ids })
      if (error) throw error
      return new Map(((data ?? []) as { user_id: string; badge: string }[]).map((row) => [row.user_id, row.badge]))
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

/** Pins one of your own earned badges, or clears it with null. The database refuses one you haven't earned. */
export async function setFeaturedBadge(badgeId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_featured_badge', { p_badge: badgeId })
  if (error) throw error
}
