import { supabase } from './api'
import { WEEK_LENGTH_DAYS } from './week'
import type { User } from '../types'
import { fetchAllPages } from './fetchAll'

// Matches the default the dashboard and leaderboard use for a contributor with no target row.
const DEFAULT_WEEKLY_TARGET = 50

export interface TeamMember {
  user: User
  submitted: number
  logged: number
  target: number
  progress: number
}

export interface LeadTeam {
  lead: User
  members: TeamMember[]
  /** Tasks the whole team submitted on each day of the week. */
  daily: { date: string; value: number }[]
  weekStart: string
  weekEnd: string
}

interface SubmissionRow {
  id: number
  user_id: string | null
  cb_email: string | null
  status: string
  date: string | null
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * One lead's team for a business week (`weekStart` is that week's Tuesday).
 * Returns null when no profile has this id. Reads rely on the caller being an
 * admin: a lead's own RLS scope would only ever show their own team anyway.
 */
export async function fetchLeadTeam(leadId: string, weekStart: string): Promise<LeadTeam | null> {
  const weekEnd = addDays(weekStart, WEEK_LENGTH_DAYS - 1)

  const { data: lead, error: leadError } = await supabase.from('profiles').select('*').eq('id', leadId).maybeSingle()
  if (leadError) throw leadError
  if (!lead) return null

  const { data: memberRows, error: membersError } = await supabase
    .from('profiles')
    .select('*')
    .eq('lead_id', leadId)
    .order('name')
  if (membersError) throw membersError
  const users = (memberRows ?? []) as User[]

  const days = Array.from({ length: WEEK_LENGTH_DAYS }, (_, i) => addDays(weekStart, i))
  if (users.length === 0) {
    return { lead: lead as User, members: [], daily: days.map((date) => ({ date, value: 0 })), weekStart, weekEnd }
  }

  const ids = users.map((u) => u.id)
  const emails = users.map((u) => u.email)
  const inWeek = () =>
    supabase.from('task_submissions').select('id, user_id, cb_email, status, date').gte('date', weekStart).lte('date', weekEnd)

  // A submission a lead logs for someone carries that contributor's cb_email but the
  // logger's user_id, so match on either, like the dashboard does.
  const [byUser, byEmail, targetsResult] = await Promise.all([
    fetchAllPages<SubmissionRow>((from, to) => inWeek().in('user_id', ids).order('id').range(from, to)),
    fetchAllPages<SubmissionRow>((from, to) => inWeek().in('cb_email', emails).order('id').range(from, to)),
    supabase.from('weekly_targets').select('user_id, target').eq('week_start', weekStart).in('user_id', ids),
  ])
  if (targetsResult.error) throw targetsResult.error

  const submissions = [...new Map([...byUser, ...byEmail].map((row) => [row.id, row])).values()]
  const targetByUser = new Map((targetsResult.data ?? []).map((t) => [t.user_id as string, Number(t.target)]))

  const members = users.map((user): TeamMember => {
    const email = user.email.toLowerCase()
    const mine = submissions.filter((s) => s.user_id === user.id || s.cb_email?.toLowerCase() === email)
    const submitted = mine.filter((s) => s.status === 'submitted').length
    const target = targetByUser.get(user.id) ?? DEFAULT_WEEKLY_TARGET
    return { user, submitted, logged: mine.length, target, progress: target ? submitted / target : 0 }
  })

  const memberEmails = new Set(emails.map((e) => e.toLowerCase()))
  const memberIds = new Set(ids)
  const daily = days.map((date) => ({
    date,
    value: submissions.filter(
      (s) =>
        s.status === 'submitted' &&
        s.date?.slice(0, 10) === date &&
        (memberIds.has(s.user_id ?? '') || memberEmails.has(s.cb_email?.toLowerCase() ?? '')),
    ).length,
  }))

  return { lead: lead as User, members, daily, weekStart, weekEnd }
}
