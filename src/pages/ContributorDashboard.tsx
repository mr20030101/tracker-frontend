import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, Check, ClipboardCheck, ClipboardList, Flame, MessageCircle, MessageSquare, Plus } from 'lucide-react'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { todayIso, weekStartIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import type { ContributorProfile, Project } from '../types'
import { Reveal } from '../components/Reveal'
import { CtsFormModal } from '../components/CtsFormModal'
import { AttendanceFormModal } from '../components/AttendanceFormModal'
import { attendanceWindow, fetchOwnAttendance } from '../lib/attendance'
import { useAttendanceClosesMin } from '../lib/useAttendanceClosesMin'
import { useTeamFeatures } from '../lib/teamFeatures'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { NoSubmissionNudge } from '../components/NoSubmissionNudge'
import { WORKING_DAYS } from '../lib/quotas'
import { dailyHoursFor, formatHours, hoursRendered } from '../lib/hoursTarget'
import { fetchAssignments } from '../lib/cbProjects'
import { Modal } from '../components/Modal'
import { OnboardingChecklist } from '../components/OnboardingChecklist'
import { SpotlightDialog } from '../components/SpotlightDialog'
import { useAchievements } from '../lib/achievements'
import { useCelebrations } from '../lib/celebrations'
import { DashboardHero } from '../components/DashboardHero'
import { usePageTitle } from '../lib/usePageTitle'
import { fetchRequestShift, shiftLabel } from '../lib/taskRequests'

// Cleared when the browser tab/session ends, so the warning comes back the next time they sign in fresh.
const WARNING_DISMISSED_KEY = 'dashboard-week-warning-dismissed'

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
    // This week only: everything here is today or this week, so their full history isn't fetched.
    queryKey: ['contributor', email, thisWeekIso, 'week'],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email, week_start: thisWeekIso, week_only: true },
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
  const cbId = data?.user?.id ?? null
  const { data: cbAssignments = [] } = useQuery({
    queryKey: ['cb-project-assignments', cbId],
    queryFn: () => fetchAssignments([cbId!]),
    enabled: Boolean(cbId),
  })

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  const lead = contributorLeadId ? usersById.get(contributorLeadId) : undefined

  const loggedToday = data.all_submissions.filter((r) => r.date?.slice(0, 10) === today).length

  // Days left in the business week, today included (Tuesday is 7, Monday is 1).
  const daysLeft = 7 - Math.round((Date.parse(today) - Date.parse(thisWeekIso)) / 86_400_000)
  // Goals in hours rendered: time on their task timers against Hours / day on their projects.
  const dayHoursTarget = dailyHoursFor(cbId ?? '', leadId, allProjects, leadProjects, cbAssignments)
  const weekHoursTarget = dayHoursTarget * WORKING_DAYS
  const hoursToday = hoursRendered(data.all_submissions.filter((r) => r.date?.slice(0, 10) === today))
  const hoursThisWeek = hoursRendered(data.week_submissions)
  const dayProgress = dayHoursTarget > 0 ? hoursToday / dayHoursTarget : 0
  const goalText = (hours: number, target: number) => (target > 0 ? `${formatHours(hours)} / ${formatHours(target)}` : 'Not set')

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

      {/* One pop-up at a time, none over the submission form: anything to celebrate, then the
          no-submissions nudge. */}
      {!submitting &&
        (celebration.current ? (
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

      {showCtsModal && <CtsFormModal email={email} submissions={todaysSubmissions} trainer={ctsTrainer} onClose={() => setShowCtsModal(false)} />}

      {/* Kept minimal: today's numbers and the week so far; history and badges are on the profile. */}
      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Hours today', value: formatHours(hoursToday) },
          {
            label: 'Goal',
            value: dayHoursTarget > 0 ? formatHours(dayHoursTarget) : 'Not set',
            extra: dayHoursTarget > 0 ? `${Math.round(Math.min(1, dayProgress) * 100)}%` : undefined,
          },
          { label: 'Submitted today', value: String(submittedToday) },
          {
            label: 'This week',
            value: formatHours(hoursThisWeek),
            extra: weekHoursTarget > 0 ? `/ ${formatHours(weekHoursTarget)}` : undefined,
          },
        ].map((tile) => (
          <div key={tile.label} className="card px-4 py-3">
            <dt className="text-xs text-gray-500">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              {tile.value}
              {tile.extra && <span className="ml-1.5 text-sm font-normal text-gray-400">{tile.extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Reveal>
  )
}
