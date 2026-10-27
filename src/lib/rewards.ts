import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, toISODate } from './week'
import type { Stage } from '../types'

// Rewards (supabase/migrations/20261014_rewards.sql): a lead or admin offers a prize for a rule
// over a date range. The database works out who's winning and, once it's over, the winners.
// Each task level (Attempter, L0, L1) is worth a number of points on a reward
// (20261023_reward_levels.sql); a level worth 0 doesn't count.

export type RewardRule = 'top_submitters' | 'min_tasks' | 'every_week_on_target' | 'custom'
export type RewardStatus = 'active' | 'awarded' | 'cancelled'

export interface Reward {
  id: number
  created_by: string
  team_lead_id: string | null
  title: string
  description: string | null
  rule: RewardRule
  threshold: number | null
  places: number
  project_id: number | null
  prize_amounts: number[]
  currency: string
  prize_note: string | null
  starts_on: string
  ends_on: string
  status: RewardStatus
  points_attempt: number
  points_l0: number
  points_l1: number
  awarded_at: string | null
  created_at: string
}

export interface RewardStanding {
  user_id: string
  name: string
  avatar_url: string | null
  /** Only returned to leads and admins; contributors get null. */
  cb_email: string | null
  /** Tasks at the levels that count. */
  submitted: number
  attempt_tasks: number
  l0_tasks: number
  l1_tasks: number
  /** What places and thresholds go by: each counted task's level points, added up. */
  points: number
  weeks_hit: number
  weeks_total: number
  reached_at: string | null
  place: number | null
  qualifies: boolean
}

export interface RewardWinner {
  reward_id: number
  user_id: string
  place: number
  amount: number
  submitted: number
  paid_at: string | null
}

export const RULE_LABELS: Record<RewardRule, string> = {
  top_submitters: 'Most tasks submitted',
  min_tasks: 'Everyone who reaches a number of tasks',
  every_week_on_target: 'On target every week',
  custom: 'Custom (you pick the winners)',
}

export const STAGES: Stage[] = ['attempt', 'l0', 'l1']

export const STAGE_LABELS: Record<Stage, string> = { attempt: 'Attempter', l0: 'L0', l1: 'L1' }

type LevelPoints = Pick<Reward, 'points_attempt' | 'points_l0' | 'points_l1'>

export function stagePoints(reward: LevelPoints): Record<Stage, number> {
  return { attempt: reward.points_attempt, l0: reward.points_l0, l1: reward.points_l1 }
}

/** The levels a reward counts, in order. */
export function countedStages(reward: LevelPoints): Stage[] {
  const points = stagePoints(reward)
  return STAGES.filter((stage) => points[stage] > 0)
}

/** Whether the counted levels are worth different amounts, so the score is points rather than tasks. */
export function usesPoints(reward: LevelPoints): boolean {
  const points = stagePoints(reward)
  return countedStages(reward).some((stage) => points[stage] !== 1)
}

/** "tasks" or "points", whichever the reward scores by, for n of them. */
export function scoreUnit(reward: LevelPoints, n: number): string {
  return `${usesPoints(reward) ? 'point' : 'task'}${n === 1 ? '' : 's'}`
}

/** A score, with up to two decimals since a level can be worth e.g. 1.5 points. */
export const formatScore = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

/** "12 tasks" or "12.5 points". */
export const scoreText = (reward: LevelPoints, n: number) => `${formatScore(n)} ${scoreUnit(reward, n)}`

/** "Attempter 10 · L0 7 · L1 6", the counted levels only. */
export function levelBreakdown(reward: LevelPoints, s: Pick<RewardStanding, 'attempt_tasks' | 'l0_tasks' | 'l1_tasks'>): string {
  const counts: Record<Stage, number> = { attempt: s.attempt_tasks, l0: s.l0_tasks, l1: s.l1_tasks }
  return countedStages(reward)
    .map((stage) => `${STAGE_LABELS[stage]} ${counts[stage].toLocaleString()}`)
    .join(' · ')
}

/**
 * Which levels count and what each is worth, e.g. "Attempter 1 pt · L0 2 pts · L1 3 pts" or
 * "L0 and L1 tasks only". Undefined for the default of every level at 1.
 */
export function describeLevels(reward: LevelPoints): string | undefined {
  const stages = countedStages(reward)
  const points = stagePoints(reward)
  if (usesPoints(reward)) return stages.map((stage) => `${STAGE_LABELS[stage]} ${points[stage]} pt${points[stage] === 1 ? '' : 's'}`).join(' · ')
  if (stages.length === STAGES.length) return undefined
  const names = stages.map((stage) => STAGE_LABELS[stage])
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} tasks only`
}

// Before the levels migration, rewards have no points (every level counted as 1) and standings no
// per-level counts.
const asReward = (r: Reward): Reward => ({
  ...r,
  prize_amounts: r.prize_amounts.map(Number),
  points_attempt: Number(r.points_attempt ?? 1),
  points_l0: Number(r.points_l0 ?? 1),
  points_l1: Number(r.points_l1 ?? 1),
})

const asStanding = (s: RewardStanding): RewardStanding => ({
  ...s,
  attempt_tasks: s.attempt_tasks ?? 0,
  l0_tasks: s.l0_tasks ?? 0,
  l1_tasks: s.l1_tasks ?? 0,
  points: Number(s.points ?? s.submitted),
})

export function useRewards() {
  return useQuery({
    queryKey: ['rewards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rewards').select('*').neq('status', 'cancelled').order('ends_on', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Reward[]).map(asReward)
    },
    // Before the migration is applied the table is missing; the page says so instead of retrying.
    retry: false,
  })
}

export function useRewardStandings(rewardId: number, enabled = true) {
  return useQuery({
    queryKey: ['reward-standings', rewardId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('reward_standings', { p_reward_id: rewardId })
      if (error) throw error
      return ((data ?? []) as RewardStanding[]).map(asStanding)
    },
    enabled,
    staleTime: 60_000,
  })
}

export function useRewardWinners() {
  return useQuery({
    queryKey: ['reward-winners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reward_winners').select('*').order('place')
      if (error) throw error
      return ((data ?? []) as RewardWinner[]).map((w) => ({ ...w, amount: Number(w.amount) }))
    },
    retry: false,
  })
}

export interface NewReward {
  title: string
  description: string
  team_lead_id: string | null
  rule: RewardRule
  threshold: number | null
  places: number
  project_id: number | null
  prize_amounts: number[]
  currency: string
  prize_note: string
  starts_on: string
  ends_on: string
  announce: boolean
  points_attempt: number
  points_l0: number
  points_l1: number
}

export async function createReward(input: NewReward): Promise<number> {
  const { data, error } = await supabase.rpc('create_reward', {
    p_title: input.title,
    p_description: input.description,
    p_team_lead_id: input.team_lead_id,
    p_rule: input.rule,
    p_threshold: input.threshold,
    p_places: input.places,
    p_project_id: input.project_id,
    p_prize_amounts: input.prize_amounts,
    p_currency: input.currency,
    p_prize_note: input.prize_note,
    p_starts_on: input.starts_on,
    p_ends_on: input.ends_on,
    p_announce: input.announce,
    p_points_attempt: input.points_attempt,
    p_points_l0: input.points_l0,
    p_points_l1: input.points_l1,
  })
  if (error) throw error
  return data as number
}

export async function awardReward(rewardId: number, userIds: string[] | null, announce: boolean): Promise<void> {
  const { error } = await supabase.rpc('award_reward', { p_reward_id: rewardId, p_user_ids: userIds, p_announce: announce })
  if (error) throw error
}

export async function cancelReward(rewardId: number): Promise<void> {
  const { error } = await supabase.rpc('cancel_reward', { p_reward_id: rewardId })
  if (error) throw error
}

export async function setRewardPaid(rewardId: number, userId: string, paid: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_reward_paid', { p_reward_id: rewardId, p_user_id: userId, p_paid: paid })
  if (error) throw error
}

/** Where a reward is in its life: not started, running, over but not awarded yet, or awarded. */
export type RewardPhase = 'upcoming' | 'live' | 'ended' | 'awarded'

export function rewardPhase(reward: Reward, today = toISODate(new Date())): RewardPhase {
  if (reward.status === 'awarded') return 'awarded'
  if (today < reward.starts_on) return 'upcoming'
  if (today <= reward.ends_on) return 'live'
  return 'ended'
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`

/** "₱1,000 for 1st, ₱500 for 2nd" or "₱200 each". */
export function describePrize(reward: Pick<Reward, 'rule' | 'places' | 'prize_amounts' | 'currency' | 'prize_note'>): string {
  const money = (n: number) => formatMoney(n, reward.currency)
  let text: string
  if (reward.rule === 'top_submitters') {
    text =
      reward.places === 1
        ? money(reward.prize_amounts[0])
        : reward.prize_amounts.slice(0, reward.places).map((a, i) => `${money(a)} for ${ordinal(i + 1)}`).join(', ')
  } else if (reward.rule === 'custom' && reward.prize_amounts.length > 1) {
    text = reward.prize_amounts.map((a, i) => `${money(a)} for ${ordinal(i + 1)}`).join(', ')
  } else {
    text = `${money(reward.prize_amounts[0])} each`
  }
  return reward.prize_note ? `${text} ${reward.prize_note}` : text
}

/** The rule as a sentence, e.g. "Whoever submits the most tasks (at least 20 tasks to qualify)." */
export function describeRule(reward: Pick<Reward, 'rule' | 'threshold' | 'places'> & LevelPoints, projectName?: string): string {
  const where = projectName ? ` on ${projectName}` : ''
  const points = usesPoints(reward)
  switch (reward.rule) {
    case 'top_submitters': {
      const who =
        reward.places === 1
          ? points ? 'Whoever scores the most points' : 'Whoever submits the most tasks'
          : `The top ${reward.places} by ${points ? 'points' : 'tasks submitted'}`
      return `${who}${where}${reward.threshold ? ` (at least ${scoreText(reward, reward.threshold)} to qualify)` : ''}. A tie goes to whoever got there first.`
    }
    case 'min_tasks':
      return points
        ? `Everyone who scores at least ${scoreText(reward, reward.threshold ?? 0)}${where}.`
        : `Everyone who submits at least ${reward.threshold} tasks${where}.`
    case 'every_week_on_target':
      return `Everyone who hits their weekly target every week${where}.`
    case 'custom':
      return 'Winners are picked by the lead when it ends.'
  }
}

/** One line on how the viewer is doing, e.g. "3 more tasks to reach 1st place." Undefined if they're not in it. */
export function myStandingLine(reward: Reward, standings: RewardStanding[], meId: string | undefined): string | undefined {
  const me = standings.find((s) => s.user_id === meId)
  if (!me) return undefined
  const more = (n: number) => `${formatScore(n)} more ${scoreUnit(reward, n)}`
  const score = me.points
  switch (reward.rule) {
    case 'top_submitters': {
      // Not which place: the order stays a secret until the winners are announced.
      if (me.qualifies && me.place) return `You're in the prize zone! Hold on to it.`
      const minimum = reward.threshold ?? 1
      if (score < minimum) return `${more(minimum - score)} to qualify.`
      const lastPrize = standings[reward.places - 1]
      if (!lastPrize) return undefined
      const gap = lastPrize.points - score
      // Whole-number points: one more than the gap gets you past them (a tie goes to whoever got
      // there first). With fractional points the smallest step varies, so give the gap itself.
      return Object.values(stagePoints(reward)).every(Number.isInteger)
        ? `${more(gap + 1)} to reach ${ordinal(reward.places)} place.`
        : `${scoreText(reward, gap)} behind ${ordinal(reward.places)} place.`
    }
    case 'min_tasks':
      return me.qualifies
        ? `You've made it with ${scoreText(reward, score)}! 🎉`
        : `${more((reward.threshold ?? 0) - score)} to go (${formatScore(score)} of ${reward.threshold}).`
    case 'every_week_on_target':
      return me.weeks_total === 0
        ? undefined
        : `${me.weeks_hit} of ${me.weeks_total} week${me.weeks_total === 1 ? '' : 's'} on target so far.`
    case 'custom':
      return undefined
  }
}

/**
 * Counts full Tuesday-to-Monday weeks whose start (Tue) and end (Mon) both fall within
 * the closed interval [startsOn, endsOn] (ISO "YYYY-MM-DD" strings).
 */
export function countFullWeeks(startsOn: string, endsOn: string): number {
  const endMs = new Date(`${endsOn}T00:00:00Z`).getTime()
  const startDate = new Date(`${startsOn}T00:00:00Z`)
  const dayOfWeek = startDate.getUTCDay() // 0=Sun,1=Mon,2=Tue,...,6=Sat
  const daysUntilTuesday = (2 - dayOfWeek + 7) % 7
  let tuesdayMs = startDate.getTime() + daysUntilTuesday * 86_400_000
  let count = 0
  while (true) {
    const mondayMs = tuesdayMs + 6 * 86_400_000
    if (mondayMs > endMs) break
    count++
    tuesdayMs += 7 * 86_400_000
  }
  return count
}

/** Quick date ranges for the form, as [start, end] ISO dates. */
export function presetRange(preset: 'this_week' | 'next_week' | 'this_month' | 'next_month'): [string, string] {
  const now = new Date()
  if (preset === 'this_week') return [toISODate(now), toISODate(endOfWeek(now))]
  if (preset === 'next_week') {
    const next = new Date(startOfWeek(now).getTime() + 7 * 86_400_000)
    return [toISODate(next), toISODate(endOfWeek(next))]
  }
  if (preset === 'this_month') return [toISODate(now), toISODate(endOfMonth(now))]
  const next = new Date(endOfMonth(now).getTime() + 86_400_000)
  return [toISODate(startOfMonth(next)), toISODate(endOfMonth(next))]
}
