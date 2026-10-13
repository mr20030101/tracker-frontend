import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'

// The caller's team week by week (supabase/migrations/20261013_motivation.sql): the same people
// the Leaderboard ranks, with what each submitted and their target, for the last few business
// weeks. Feeds the dashboard's rank card, team goal and weekly recap, and "Most improved".

export interface TeamWeekRow {
  user_id: string
  name: string
  avatar_url: string | null
  cb_email: string
  week_start: string
  submitted: number
  target: number
}

/** Six weeks: this week, last week, and the four before it that "Most improved" averages. */
const HISTORY_WEEKS = 6

export function useTeamWeeks() {
  return useQuery({
    queryKey: ['team-weeks', HISTORY_WEEKS],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_weekly_history', { p_weeks: HISTORY_WEEKS })
      if (error) throw error
      return (data ?? []) as TeamWeekRow[]
    },
    staleTime: 60_000,
    // Before the migration is applied the function is missing; the cards that use it just don't show.
    retry: false,
  })
}

/** The week starts in the history, newest first. */
export function weekStarts(rows: TeamWeekRow[]): string[] {
  return [...new Set(rows.map((r) => r.week_start))].sort().reverse()
}

/** One week's rows in Leaderboard order: most submitted first, then by name. */
export function rankWeek(rows: TeamWeekRow[], weekStart: string): TeamWeekRow[] {
  return rows
    .filter((r) => r.week_start === weekStart)
    .sort((a, b) => b.submitted - a.submitted || a.name.localeCompare(b.name))
}

export interface Standing {
  rank: number
  of: number
  submitted: number
  /** The person one place up and how many more tasks it takes to pass them. Undefined at #1. */
  above?: { name: string; gap: number }
  /** At #1: the lead over #2. */
  lead?: number
}

export function standingFor(ranked: TeamWeekRow[], userId: string): Standing | undefined {
  const index = ranked.findIndex((r) => r.user_id === userId)
  if (index < 0) return undefined
  const me = ranked[index]
  const standing: Standing = { rank: index + 1, of: ranked.length, submitted: me.submitted }
  if (index > 0) {
    const above = ranked[index - 1]
    // Passing them takes one more than they have (ties go by name, so drawing level isn't enough).
    standing.above = { name: above.name, gap: above.submitted - me.submitted + 1 }
  } else if (ranked.length > 1) {
    standing.lead = me.submitted - ranked[1].submitted
  }
  return standing
}

/** The whole team's week: everyone's submissions against the sum of everyone's targets. */
export function teamGoal(ranked: TeamWeekRow[]): { submitted: number; target: number } {
  return ranked.reduce((sum, r) => ({ submitted: sum.submitted + r.submitted, target: sum.target + r.target }), { submitted: 0, target: 0 })
}

export interface Improvement {
  row: TeamWeekRow
  /** Their average over the weeks before. */
  average: number
  change: number
}

/**
 * "Most improved": each person's last finished week against their average over the four weeks
 * before it. Last week rather than this one, so it isn't skewed by how far into the week it is.
 */
export function mostImproved(rows: TeamWeekRow[]): Improvement[] {
  const [, lastWeek, ...before] = weekStarts(rows)
  if (!lastWeek || before.length === 0) return []
  return rankWeek(rows, lastWeek)
    .map((row) => {
      const earlier = rows.filter((r) => r.user_id === row.user_id && before.includes(r.week_start))
      const average = earlier.reduce((sum, r) => sum + r.submitted, 0) / before.length
      return { row, average, change: row.submitted - average }
    })
    .sort((a, b) => b.change - a.change || a.row.name.localeCompare(b.row.name))
}
