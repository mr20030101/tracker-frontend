import { supabase } from './api'
import { startOfWeek, toISODate, WEEK_LENGTH_DAYS } from './week'
import { fetchAllPages } from './fetchAll'

// Team Reports: each lead's team, week by week (Tuesday–Monday, Singapore time, like the rest of
// the app). Worked out from the same tables the dashboard reads, so the numbers agree with it.
//
// A contributor's team is their lead as it is now; someone who moved team counts for their
// current one in every week shown.

export type TeamMetric = 'submitted' | 'active' | 'bad_videos'

export const TEAM_METRICS: { metric: TeamMetric; label: string; description: string }[] = [
  { metric: 'submitted', label: 'Tasks submitted', description: 'Tasks marked submitted in the week.' },
  { metric: 'active', label: 'Active contributors', description: 'Contributors who submitted at least one task in the week.' },
  { metric: 'bad_videos', label: 'Bad-video reports', description: "Bad-video reports filed in the week about the team's tasks." },
]

export interface TeamWeek {
  weekStart: string
  submitted: number
  active: number
  bad_videos: number
}

export interface TeamReport {
  // Null for contributors without a lead.
  leadId: string | null
  leadName: string
  contributors: number
  weeks: TeamWeek[]
}

/** The `count` most recent week starts (yyyy-mm-dd), oldest first, ending with the current week. */
export function recentWeekStarts(count: number, now = new Date()): string[] {
  const current = startOfWeek(now)
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(current)
    day.setUTCDate(day.getUTCDate() - WEEK_LENGTH_DAYS * (count - 1 - i))
    return toISODate(day)
  })
}

/** The week start (from `weekStarts`) a yyyy-mm-dd date falls in, or null if it's outside them. */
export function weekOf(date: string, weekStarts: string[]): string | null {
  for (let i = weekStarts.length - 1; i >= 0; i--) {
    if (date >= weekStarts[i]) {
      const end = new Date(`${weekStarts[i]}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + WEEK_LENGTH_DAYS)
      return date < end.toISOString().slice(0, 10) ? weekStarts[i] : null
    }
  }
  return null
}

export async function fetchTeamReports(weekCount: number, onlyLeadId: string | null): Promise<{ weekStarts: string[]; teams: TeamReport[] }> {
  const weekStarts = recentWeekStarts(weekCount)
  const from = weekStarts[0]
  const lastStart = new Date(`${weekStarts[weekStarts.length - 1]}T00:00:00Z`)
  lastStart.setUTCDate(lastStart.getUTCDate() + WEEK_LENGTH_DAYS - 1)
  const to = lastStart.toISOString().slice(0, 10)

  const [contributors, leads, submissions, badVideos] = await Promise.all([
    supabase.from('profiles').select('id, email, lead_id, is_active').eq('role', 'contributor'),
    supabase.from('profiles').select('id, name').in('role', ['lead', 'admin']),
    // Paged: weeks of submissions are far more than the 1,000 rows one request returns.
    fetchAllPages<{ user_id: string | null; cb_email: string | null; date: string | null }>((start, end) =>
      supabase
        .from('task_submissions')
        .select('user_id, cb_email, date')
        .eq('status', 'submitted')
        .gte('date', from)
        .lte('date', to)
        .order('id')
        .range(start, end),
    ),
    fetchAllPages<unknown>((start, end) =>
      supabase
        .from('task_requests')
        .select('requested_at, task_submission:task_submissions(cb_email)')
        .eq('type', 'bad_video')
        .gte('requested_at', `${from}T00:00:00+08:00`)
        .lte('requested_at', `${to}T23:59:59+08:00`)
        .order('id')
        .range(start, end),
    ),
  ])
  for (const result of [contributors, leads]) {
    if (result.error) throw result.error
  }

  type Contributor = { id: string; email: string; lead_id: string | null; is_active: boolean }
  const people = (contributors.data ?? []) as Contributor[]
  const leadNames = new Map(((leads.data ?? []) as { id: string; name: string }[]).map((lead) => [lead.id, lead.name]))
  const byId = new Map(people.map((person) => [person.id, person]))
  const byEmail = new Map(people.map((person) => [person.email.toLowerCase(), person]))
  const teamKey = (person: Contributor | undefined) => (person ? (person.lead_id ?? '') : null)

  // team key ('' = no lead) -> week start -> tallies
  const tallies = new Map<string, Map<string, { submitted: number; active: Set<string>; bad_videos: number }>>()
  const cell = (team: string, week: string) => {
    if (!tallies.has(team)) tallies.set(team, new Map())
    const weeks = tallies.get(team)!
    if (!weeks.has(week)) weeks.set(week, { submitted: 0, active: new Set(), bad_videos: 0 })
    return weeks.get(week)!
  }

  for (const row of submissions) {
    const person = (row.user_id && byId.get(row.user_id)) || (row.cb_email ? byEmail.get(row.cb_email.toLowerCase()) : undefined)
    const team = teamKey(person)
    const week = row.date ? weekOf(row.date, weekStarts) : null
    if (team === null || !week || !person) continue
    const tally = cell(team, week)
    tally.submitted += 1
    tally.active.add(person.id)
  }

  for (const row of badVideos as { requested_at: string; task_submission: { cb_email: string } | null }[]) {
    const person = row.task_submission ? byEmail.get(row.task_submission.cb_email.toLowerCase()) : undefined
    const team = teamKey(person)
    // The report's own day, in Singapore time.
    const week = weekOf(toISODate(new Date(row.requested_at)), weekStarts)
    if (team === null || !week) continue
    cell(team, week).bad_videos += 1
  }

  const teamKeys = new Set([...people.filter((p) => p.is_active).map((p) => p.lead_id ?? ''), ...tallies.keys()])
  const teams = [...teamKeys]
    .filter((key) => onlyLeadId === null || key === onlyLeadId)
    .map((key): TeamReport => ({
      leadId: key || null,
      leadName: key ? (leadNames.get(key) ?? 'Unknown lead') : 'No lead',
      contributors: people.filter((p) => p.is_active && (p.lead_id ?? '') === key).length,
      weeks: weekStarts.map((weekStart) => {
        const tally = tallies.get(key)?.get(weekStart)
        return { weekStart, submitted: tally?.submitted ?? 0, active: tally?.active.size ?? 0, bad_videos: tally?.bad_videos ?? 0 }
      }),
    }))
    // Teams with a lead first, by name; "No lead" last.
    .sort((a, b) => (a.leadId === null ? 1 : b.leadId === null ? -1 : a.leadName.localeCompare(b.leadName)))

  return { weekStarts, teams }
}
