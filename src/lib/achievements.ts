import { useQuery } from '@tanstack/react-query'
import { Award, Crown, Flame, Medal, Rocket, Sparkles, Target, Zap, type LucideIcon } from 'lucide-react'
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
  // Tailwind classes for an earned badge's chip.
  tone: string
  earned: (a: Achievements) => boolean
}

// Worked out from the rollups above, so a new badge needs no database change.
export const BADGES: Badge[] = [
  {
    id: 'first-task',
    label: 'First Task',
    description: 'Submitted a first task.',
    icon: Sparkles,
    tone: 'bg-sky-50 text-sky-700 border-sky-200',
    earned: (a) => a.total_submitted >= 1,
  },
  {
    id: 'target-hit',
    label: 'On Target',
    description: 'Hit a weekly target.',
    icon: Target,
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    earned: (a) => a.weeks_hit >= 1,
  },
  {
    id: 'streak-3',
    label: 'On a Roll',
    description: 'Hit the target 3 weeks in a row.',
    icon: Flame,
    tone: 'bg-orange-50 text-orange-700 border-orange-200',
    earned: (a) => a.best_streak >= 3,
  },
  {
    id: 'streak-10',
    label: 'Unstoppable',
    description: 'Hit the target 10 weeks in a row.',
    icon: Zap,
    tone: 'bg-amber-50 text-amber-700 border-amber-200',
    earned: (a) => a.best_streak >= 10,
  },
  {
    id: 'club-100',
    label: '100 Club',
    description: 'Submitted 100 tasks.',
    icon: Medal,
    tone: 'bg-violet-50 text-violet-700 border-violet-200',
    earned: (a) => a.total_submitted >= 100,
  },
  {
    id: 'club-500',
    label: '500 Club',
    description: 'Submitted 500 tasks.',
    icon: Award,
    tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    earned: (a) => a.total_submitted >= 500,
  },
  {
    id: 'club-1000',
    label: '1,000 Club',
    description: 'Submitted 1,000 tasks.',
    icon: Crown,
    tone: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    earned: (a) => a.total_submitted >= 1000,
  },
  {
    id: 'big-week',
    label: 'Big Week',
    description: 'Submitted 100 tasks in a single week.',
    icon: Rocket,
    tone: 'bg-rose-50 text-rose-700 border-rose-200',
    earned: (a) => a.best_week >= 100,
  },
]

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
