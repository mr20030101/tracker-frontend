import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, toISODate } from './week'

// Rewards (supabase/migrations/20261014_rewards.sql): a lead or admin offers a prize for a rule
// over a date range. The database works out who's winning and, once it's over, the winners.

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
  awarded_at: string | null
  created_at: string
}

export interface RewardStanding {
  user_id: string
  name: string
  avatar_url: string | null
  cb_email: string
  submitted: number
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

export function useRewards() {
  return useQuery({
    queryKey: ['rewards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rewards').select('*').neq('status', 'cancelled').order('ends_on', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Reward[]).map((r) => ({ ...r, prize_amounts: r.prize_amounts.map(Number) }))
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
      return (data ?? []) as RewardStanding[]
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

/** The rule as a sentence, e.g. "Whoever submits the most tasks (at least 20 to qualify)." */
export function describeRule(reward: Pick<Reward, 'rule' | 'threshold' | 'places'>, projectName?: string): string {
  const where = projectName ? ` on ${projectName}` : ''
  switch (reward.rule) {
    case 'top_submitters': {
      const who = reward.places === 1 ? 'Whoever submits the most tasks' : `The top ${reward.places} by tasks submitted`
      return `${who}${where}${reward.threshold ? ` (at least ${reward.threshold} to qualify)` : ''}. A tie goes to whoever got there first.`
    }
    case 'min_tasks':
      return `Everyone who submits at least ${reward.threshold} tasks${where}.`
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
  const plural = (n: number) => `${n.toLocaleString()} more task${n === 1 ? '' : 's'}`
  switch (reward.rule) {
    case 'top_submitters': {
      if (me.qualifies && me.place) return `You're in ${ordinal(me.place)} place: ${formatMoney(reward.prize_amounts[me.place - 1], reward.currency)}! Hold on to it.`
      const minimum = reward.threshold ?? 1
      if (me.submitted < minimum) return `${plural(minimum - me.submitted)} to qualify.`
      const lastPrize = standings[reward.places - 1]
      if (!lastPrize) return undefined
      return `${plural(lastPrize.submitted - me.submitted + 1)} to reach ${ordinal(reward.places)} place.`
    }
    case 'min_tasks':
      return me.qualifies
        ? `You've made it with ${me.submitted.toLocaleString()} tasks! 🎉`
        : `${plural((reward.threshold ?? 0) - me.submitted)} to go (${me.submitted.toLocaleString()} of ${reward.threshold}).`
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
