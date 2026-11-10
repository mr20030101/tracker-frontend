import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, Check, ClipboardCheck, ClipboardList, Flame, MessageCircle, MessageSquare, Plus, Trophy } from 'lucide-react'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { toISODate, todayIso, weekStartIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import type { ContributorProfile, ContributorProjectLevel, Project, ProjectLevel } from '../types'
import { ProgressRing } from '../components/ProgressRing'
import { LineChart } from '../components/LineChart'
import { CountUp } from '../components/CountUp'
import { GrowBar } from '../components/GrowBar'
import { Reveal } from '../components/Reveal'
import { CtsFormModal } from '../components/CtsFormModal'
import { AttendanceFormModal } from '../components/AttendanceFormModal'
import { attendanceWindow, fetchOwnAttendance } from '../lib/attendance'
import { useAttendanceClosesMin } from '../lib/useAttendanceClosesMin'
import { useTeamFeatures } from '../lib/teamFeatures'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { NoSubmissionNudge } from '../components/NoSubmissionNudge'
import { LevelPill } from '../components/LevelPill'
import { WORKING_DAYS, projectQuota } from '../lib/quotas'
import { dailyHoursFor, formatHours, hoursRendered } from '../lib/hoursTarget'
import { Modal } from '../components/Modal'
import { OnboardingChecklist } from '../components/OnboardingChecklist'
import { AchievementsCard } from '../components/Achievements'
import { StreakRiskCard, TeamPulseCard, WeeklyRecap, type RecapStats } from '../components/DashboardMotivation'
import { SpotlightDialog } from '../components/SpotlightDialog'
import { RewardsSpotlight } from '../components/RewardsSpotlight'
import { useAchievements } from '../lib/achievements'
import { useCelebrations } from '../lib/celebrations'
import { rankWeek, standingFor, teamGoal, useTeamWeeks, weekStarts } from '../lib/teamWeeks'
import { DashboardHero } from '../components/DashboardHero'
import { usePageTitle } from '../lib/usePageTitle'
import { fetchRequestShift, shiftLabel } from '../lib/taskRequests'

const TREND_DAYS = 30

// Cleared when the browser tab/session ends, so the warning comes back the next time they sign in fresh.
const WARNING_DISMISSED_KEY = 'dashboard-week-warning-dismissed'

// The week whose recap someone last saw, so it shows once at the start of each week.
const recapSeenKey = (userId: string) => `weekly-recap-seen:${userId}`

function readRecapSeen(userId: string): string | null {
  try {
    return localStorage.getItem(recapSeenKey(userId))
  } catch {
    return null
  }
}

export function ContributorDashboard() {
  usePageTitle('Dashboard')
  const { user } = useAuth()
  const email = user?.email ?? ''
  const { usersById, openChatWith, messagingEnabled } = useMessaging()
  const bot = useMemo(() => [...usersById.values()].find((u) => u.is_bot), [usersById])
  const [showCtsModal, setShowCtsModal] = useState(false)
  // A lead can switch the CTS Form and Attendance off for their team.
  const { ctsEnabled, ctsTrainer, attendanceEnabled } = useTeamFeatures(user?.id)
  const [submitting, setSubmitting] = useState(false)
  // Shown at most once per browser session: once dismissed, a reload won't bring it back.
  const [showWarning, setShowWarning] = useState(() => {
    try {
      return sessionStorage.getItem(WARNING_DISMISSED_KEY) !== 'true'
    } catch {
      return true
    }
  })
  const [showAttendanceEnded, setShowAttendanceEnded] = useState(false)
  const [showAttendanceForm, setShowAttendanceForm] = useState(false)
  const now = useNow(60_000)
  const { closesMin, closesLabel } = useAttendanceClosesMin()
  const thisWeekIso = weekStartIso(now)
  const today = todayIso(now)

  function dismissWarning() {
    setShowWarning(false)
    try {
      sessionStorage.setItem(WARNING_DISMISSED_KEY, 'true')
    } catch {
      // Not remembering is fine — it'll just show again next reload.
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['contributor', email, thisWeekIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email, week_start: thisWeekIso },
        })
      ).data,
    enabled: Boolean(email),
  })

  const contributorId = data?.user?.id ?? null

  // The lead's shift: when they're around, and when requests can be sent.
  const { data: leadShift = null } = useQuery({ queryKey: ['request-shift'], queryFn: fetchRequestShift })
  const { data: todaysAttendance } = useQuery({
    queryKey: ['attendance', 'own', user?.id, today],
    queryFn: () => fetchOwnAttendance(user!.id, today),
    enabled: Boolean(user),
  })
  const contributorLeadId = data?.user?.lead_id ?? null

  const { data: achievementsById } = useAchievements(contributorId ? [contributorId] : [])
  const achievements = contributorId ? achievementsById?.get(contributorId) : undefined
  const { data: teamRows = [] } = useTeamWeeks()

  const [recapSeen, setRecapSeen] = useState<string | null>(() => (user ? readRecapSeen(user.id) : null))
  function closeRecap() {
    setRecapSeen(thisWeekIso)
    try {
      if (user) localStorage.setItem(recapSeenKey(user.id), thisWeekIso)
    } catch {
      // Not remembering only means it shows again next visit.
    }
  }

  const submittedToday = (data?.all_submissions ?? []).filter((r) => r.date?.slice(0, 10) === today && r.status === 'submitted').length
  const dayTarget = Math.round((data?.weekly_target ?? 0) / WORKING_DAYS)
  const celebration = useCelebrations({
    userId: user?.id ?? '',
    loaded: Boolean(data),
    achievements,
    today,
    weekStart: thisWeekIso,
    submittedToday,
    dayTarget,
    submittedThisWeek: data?.submitted_this_week ?? 0,
    weeklyTarget: data?.weekly_target ?? 0,
  })

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  // The projects on their lead's team: the goals are the highest Hours / day among them.
  const leadId = data?.user?.lead_id ?? null
  const { data: leadProjects = [] } = useQuery({
    queryKey: ['project-leads', 'of-lead', leadId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('project_leads').select('project_id, lead_id').eq('lead_id', leadId!)
      if (error) throw error
      return rows as { project_id: number; lead_id: string }[]
    },
    enabled: Boolean(leadId),
  })

  // A contributor's project list is exactly whichever projects their lead runs.
  const { data: leadProjectIds = [] } = useQuery({
    queryKey: ['project-leads-for-lead', contributorLeadId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('project_leads')
        .select('project_id')
        .eq('lead_id', contributorLeadId!)
      if (error) throw error
      return rows.map((row) => row.project_id as number)
    },
    enabled: Boolean(contributorLeadId),
  })

  const { data: projectLevels = [] } = useQuery({
    queryKey: ['contributor-project-levels', contributorId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('contributor_project_levels')
        .select('*')
        .eq('user_id', contributorId!)
      if (error) throw error
      return rows as ContributorProjectLevel[]
    },
    enabled: Boolean(contributorId),
  })

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  const levelByProjectId = new Map(projectLevels.map((row) => [row.project_id, row.level]))
  const levelProjects = leadProjectIds
    .map((id) => allProjects.find((project) => project.id === id))
    .filter((project): project is Project => Boolean(project))
    .map((project) => ({ project, level: levelByProjectId.get(project.id) ?? ('contributor' as ProjectLevel) }))

  const lead = contributorLeadId ? usersById.get(contributorLeadId) : undefined

  const loggedToday = data.all_submissions.filter((r) => r.date?.slice(0, 10) === today).length

  // Where they stand on the team's board, this week and last (for the recap).
  const [historyWeek, lastWeek] = weekStarts(teamRows)
  const ranked = historyWeek === thisWeekIso ? rankWeek(teamRows, thisWeekIso) : []
  const standing = contributorId ? standingFor(ranked, contributorId) : undefined
  const lastRanked = lastWeek ? rankWeek(teamRows, lastWeek) : []
  const lastIndex = lastRanked.findIndex((r) => r.user_id === contributorId)
  const recapStats: RecapStats | undefined =
    lastIndex >= 0 && achievements
      ? {
          submitted: lastRanked[lastIndex].submitted,
          target: lastRanked[lastIndex].target,
          rank: lastIndex + 1,
          of: lastRanked.length,
          streak: achievements.current_streak,
          nextTarget: data.weekly_target,
        }
      : undefined
  const showRecap = Boolean(recapStats) && recapSeen !== thisWeekIso
  // Days left in the business week, today included (Tuesday is 7, Monday is 1).
  const daysLeft = 7 - Math.round((Date.parse(today) - Date.parse(thisWeekIso)) / 86_400_000)
  // Goals in hours rendered: time on their task timers against Hours / day on their projects.
  const dayHoursTarget = dailyHoursFor(leadId, allProjects, leadProjects)
  const weekHoursTarget = dayHoursTarget * WORKING_DAYS
  const hoursToday = hoursRendered(data.all_submissions.filter((r) => r.date?.slice(0, 10) === today))
  const hoursThisWeek = hoursRendered(data.week_submissions)
  const dayProgress = dayHoursTarget > 0 ? hoursToday / dayHoursTarget : 0
  const goalText = (hours: number, target: number) => (target > 0 ? `${formatHours(hours)} / ${formatHours(target)}` : 'Not set')

  const stages = Object.entries(data.stage_breakdown) as [string, number][]
  const maxStageTotal = Math.max(1, ...stages.map(([, total]) => total))
  const maxProjectTotal = Math.max(1, ...data.project_breakdown.map((p) => p.total))

  const trendData = Array.from({ length: TREND_DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (TREND_DAYS - 1 - i))
    const iso = toISODate(d)
    const value = data.all_submissions.filter((r) => r.date?.slice(0, 10) === iso && r.status === 'submitted').length
    return { date: iso, value }
  })

  // Today's, not already submitted to CTS, and not still in progress — same as the CTS Form on the profile page.
  const todaysSubmissions = data.all_submissions.filter(
    (row) => row.date?.slice(0, 10) === today && row.status !== 'in_progress' && !row.cts_submitted_at,
  )

  const attendanceState = attendanceWindow(new Date(now), closesMin)
  const attendanceNotYetOpen = attendanceState === 'not-open'

  function handleAttendanceClick() {
    // The time right now, not `now`, which is up to a minute old.
    if (attendanceWindow(new Date(), closesMin) === 'open') {
      setShowAttendanceForm(true)
    } else {
      // Only reachable once it's opened for the day (the button is disabled before 6 AM), so this is the "already closed" case.
      setShowAttendanceEnded(true)
    }
  }

  return (
    <Reveal>
      <DashboardHero
        stats={[
          { value: submittedToday, label: 'Today', icon: ClipboardCheck },
          { value: data.submitted_this_week, label: 'This week', icon: CalendarDays },
          { value: achievements?.current_streak ?? 0, label: 'Day streak', icon: Flame },
        ]}
        meters={[
          { label: 'Day goal', pct: dayProgress * 100, tone: 'night', text: goalText(hoursToday, dayHoursTarget) },
          {
            label: 'Week goal',
            pct: weekHoursTarget > 0 ? (hoursThisWeek / weekHoursTarget) * 100 : 0,
            tone: 'honey',
            text: goalText(hoursThisWeek, weekHoursTarget),
          },
          { label: 'Logged today, submitted', pct: loggedToday > 0 ? (submittedToday / loggedToday) * 100 : 0, tone: 'striped' },
          { label: 'Week gone', pct: ((7 - daysLeft) / 7) * 100, tone: 'outline' },
        ]}
        subtitle="Ready to make today count? Here's how your week is going."
        actions={
          <>
              <button
                type="button"
                onClick={() => setSubmitting(true)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors duration-100 hover:bg-accent-bg"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Submit a Task
              </button>
              {ctsEnabled && (
              <button
                type="button"
                onClick={() => setShowCtsModal(true)}
                className="inline-flex h-11 animate-heartbeat-soft items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-ink-foreground transition-colors duration-100 hover:bg-ink/90"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                CTS Form
              </button>
              )}
              {attendanceEnabled && (
              <button
                type="button"
                onClick={() => !attendanceNotYetOpen && handleAttendanceClick()}
                aria-disabled={attendanceNotYetOpen}
                className={`inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-semibold shadow-card transition-colors duration-100 ${
                  attendanceNotYetOpen ? 'cursor-not-allowed bg-gray-100 text-gray-600' : 'bg-white text-gray-800 hover:bg-gray-100'
                }`}
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                {attendanceNotYetOpen ? 'Attendance opens at 6:00 AM' : todaysAttendance ? 'Attendance filed ✓' : 'Attendance Form'}
              </button>
              )}
              {bot && messagingEnabled && (
                <button
                  type="button"
                  onClick={() => openChatWith(bot.id, bot.name)}
                  className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-gray-800 shadow-card transition-colors duration-100 hover:bg-gray-100"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat with {bot.name}
                </button>
              )}
              {lead && (
                <button
                  type="button"
                  onClick={() => openChatWith(lead.id, lead.name)}
                  className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-gray-800 shadow-card transition-colors duration-100 hover:bg-gray-100"
                >
                  <MessageSquare className="h-4 w-4" />
                  Message {lead.name}
                  {leadShift && <span className="font-normal text-gray-400">· on shift {shiftLabel(leadShift)}</span>}
                </button>
              )}
          </>
        }
      />

      {showAttendanceForm && user && (
        <AttendanceFormModal
          person={{ id: user.id, name: user.name, email }}
          date={today}
          existing={todaysAttendance ?? null}
          onClose={() => setShowAttendanceForm(false)}
        />
      )}

      {showAttendanceEnded && (
        <Modal title="Attendance has ended" onClose={() => setShowAttendanceEnded(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Today's attendance window closes at {closesLabel}, and it's already past that. If you couldn't file, ask your lead to file it for you.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAttendanceEnded(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                <Check className="h-4 w-4" aria-hidden />
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* One pop-up at a time, none over the submission form: the week's recap, then anything to
          celebrate, then the no-submissions nudge (which the recap already covers when it shows). */}
      {!submitting &&
        (showRecap && recapStats ? (
          <WeeklyRecap
            stats={recapStats}
            onSubmit={() => {
              closeRecap()
              dismissWarning()
              setSubmitting(true)
            }}
            onClose={() => {
              closeRecap()
              dismissWarning()
            }}
          />
        ) : celebration.current ? (
          <SpotlightDialog
            icon={celebration.current.icon}
            title={celebration.current.title}
            primary={{ label: 'Keep it going!', icon: ArrowRight, onClick: celebration.dismiss }}
            onClose={celebration.dismiss}
          >
            {celebration.current.body}
          </SpotlightDialog>
        ) : (
          showWarning &&
          data.submitted_this_week === 0 && (
            <NoSubmissionNudge
              onSubmit={() => {
                dismissWarning()
                setSubmitting(true)
              }}
              onDismiss={dismissWarning}
            />
          )
        ))}

      {submitting && <TaskSubmissionForm onClose={() => setSubmitting(false)} />}

      {contributorId && (
        <OnboardingChecklist
          userId={contributorId}
          hasLead={Boolean(contributorLeadId)}
          actions={{
            first_task: { label: 'Submit a task', icon: Plus, onClick: () => setSubmitting(true) },
            ...(lead ? { message_lead: { label: `Message ${lead.name}`, icon: MessageSquare, onClick: () => openChatWith(lead.id, lead.name) } } : {}),
          }}
        />
      )}

      {achievements && (
        <StreakRiskCard
          streak={achievements.current_streak}
          submitted={data.submitted_this_week}
          target={data.weekly_target}
          daysLeft={daysLeft}
          onSubmit={() => setSubmitting(true)}
        />
      )}

      {showCtsModal && <CtsFormModal email={email} submissions={todaysSubmissions} trainer={ctsTrainer} onClose={() => setShowCtsModal(false)} />}

      {ranked.length > 0 && <TeamPulseCard standing={standing} team={teamGoal(ranked)} />}

      {contributorId && <RewardsSpotlight meId={contributorId} />}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex items-center gap-5 card p-5 lg:col-span-1">
          <ProgressRing value={dayProgress} label="Day Goal" sublabel={goalText(hoursToday, dayHoursTarget)} />
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Hours (Day)</div>
              <div className="text-xl font-bold tabular-nums text-gray-900">{formatHours(hoursToday)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Submitted (Day)</div>
              <div className="text-xl font-bold text-gray-900">
                <CountUp value={submittedToday} />
              </div>
            </div>
            <div className="text-xs text-gray-400">
              {dayHoursTarget > 0
                ? 'Hours are the time on your task timers. The goal is a minimum, with no upper limit.'
                : 'No Hours / day is set on your projects yet, so there’s no goal to show.'}
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-lg text-gray-900">Submission trend</div>
            <span className="text-xs text-gray-400">last {TREND_DAYS} days</span>
          </div>
          <LineChart data={trendData} color="#e0a91f" unitLabel="submitted" />
        </div>
      </div>

      {contributorId && <AchievementsCard userId={contributorId} title="Your streak & badges" canFeature />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 font-display text-lg text-gray-900">By stage <span className="text-sm text-gray-500">all-time</span></div>
          <div className="flex flex-col gap-3">
            {stages.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
            {stages.map(([stage, total], index) => (
              <div key={stage} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 uppercase text-gray-600">{stage}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <GrowBar
                    className="h-full rounded-full bg-accent"
                    pct={Math.max(4, (total / maxStageTotal) * 100)}
                    delay={400 + index * 80}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium text-gray-900">{total}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-4 font-display text-lg text-gray-900">By project <span className="text-sm text-gray-500">all-time</span></div>
          <div className="flex flex-col gap-3">
            {data.project_breakdown.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
            {data.project_breakdown.map((p, index) => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-gray-600" title={p.name}>
                  {p.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <GrowBar
                    className="h-full rounded-full bg-ink"
                    pct={Math.max(4, (p.total / maxProjectTotal) * 100)}
                    delay={400 + index * 80}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium text-gray-900">{p.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {levelProjects.length > 0 && (
        <div className="mt-6 card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Trophy className="h-4 w-4 text-gray-500" />
            Project Levels
          </div>
          <div className="divide-y divide-gray-100">
            {levelProjects.map(({ project, level }) => {
              // Each project's quota is tracked on its own: today's submitted tasks on it against the
              // quota it sets for their level.
              const quota = projectQuota(project, level)
              const done = data.all_submissions.filter((r) => r.project_id === project.id && r.date?.slice(0, 10) === today && r.status === 'submitted').length
              return (
                <div key={project.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium uppercase tracking-wide text-gray-700">{project.name}</span>
                    <LevelPill level={level} />
                  </div>
                  {quota !== null && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${done >= quota ? 'bg-ink' : 'bg-accent'}`}
                          style={{ width: `${quota > 0 ? Math.min(100, (done / quota) * 100) : 100}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs text-gray-500">
                        <span className="font-semibold text-gray-900">{done}</span> / {quota} today
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Reveal>
  )
}
