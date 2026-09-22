import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ClipboardList, MessageCircle, Trophy, User, type LucideIcon } from 'lucide-react'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, toISODate, sgMinutesSinceMidnight } from '../lib/week'
import type { ContributorProfile, ContributorProjectLevel, Project, ProjectLevel } from '../types'
import { ProgressRing } from '../components/ProgressRing'
import { LineChart } from '../components/LineChart'
import { CountUp } from '../components/CountUp'
import { GrowBar } from '../components/GrowBar'
import { Reveal } from '../components/Reveal'
import { CtsFormModal } from '../components/CtsFormModal'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { LevelPill } from '../components/LevelPill'
import { Modal } from '../components/Modal'

const TREND_DAYS = 30

interface QuickLink {
  to: string
  label: string
  icon: LucideIcon
}

const ATTENDANCE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdItgT4AYcL14m0A3t5Rx7nGaySxDe64J1VZtInYD0ukepAfg/viewform'

// Attendance is only taken 6:00 AM – 1:30 PM, Singapore time.
const ATTENDANCE_OPENS_MIN = 6 * 60
const ATTENDANCE_CLOSES_MIN = 13 * 60 + 30

// Cleared when the browser tab/session ends, so the warning comes back the next time they sign in fresh.
const WARNING_DISMISSED_KEY = 'dashboard-week-warning-dismissed'

function buildAttendanceFormUrl(email: string) {
  const params = new URLSearchParams()
  if (email) params.set('entry.787543998', email)
  return `${ATTENDANCE_FORM_URL}?${params.toString()}`
}

export function ContributorDashboard() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const [showCtsModal, setShowCtsModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Shown at most once per browser session: once dismissed (or faded on its own), a reload won't bring it back.
  const [showWarning, setShowWarning] = useState(() => {
    try {
      return sessionStorage.getItem(WARNING_DISMISSED_KEY) !== 'true'
    } catch {
      return true
    }
  })
  const [showAttendanceEnded, setShowAttendanceEnded] = useState(false)
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])
  const today = useMemo(() => toISODate(new Date()), [])

  function dismissWarning() {
    setShowWarning(false)
    try {
      sessionStorage.setItem(WARNING_DISMISSED_KEY, 'true')
    } catch {
      // Not remembering is fine — it'll just show again next reload.
    }
  }

  // Fades on its own after a while, same as a dismiss.
  useEffect(() => {
    if (!showWarning) return
    const timer = setTimeout(dismissWarning, 10000)
    return () => clearTimeout(timer)
  }, [showWarning])

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
  const contributorLeadId = data?.user?.lead_id ?? null

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
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

  const quickLinks: QuickLink[] = [
    { to: `/contributors/${encodeURIComponent(email)}`, label: 'Profile', icon: User },
    { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/task-log', label: 'Task Log', icon: ClipboardList },
    { to: '/resources', label: 'Resources', icon: BookOpen },
    { to: '/messages', label: 'Messages', icon: MessageCircle },
  ]

  const submittedToday = data.all_submissions.filter((r) => r.date?.slice(0, 10) === today && r.status === 'submitted').length
  const loggedToday = data.all_submissions.filter((r) => r.date?.slice(0, 10) === today).length
  const dayTarget = Math.round(data.weekly_target / 5)
  const dayProgress = dayTarget > 0 ? submittedToday / dayTarget : 0

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

  const nowMinutesSGT = sgMinutesSinceMidnight(new Date())
  const attendanceNotYetOpen = nowMinutesSGT < ATTENDANCE_OPENS_MIN
  const attendanceOpen = nowMinutesSGT >= ATTENDANCE_OPENS_MIN && nowMinutesSGT < ATTENDANCE_CLOSES_MIN

  function handleAttendanceClick() {
    if (attendanceOpen) {
      window.open(buildAttendanceFormUrl(email), '_blank', 'noopener,noreferrer')
    } else {
      // Only reachable once it's opened for the day (the button is disabled before 6 AM), so this is the "already closed" case.
      setShowAttendanceEnded(true)
    }
  }

  return (
    <Reveal>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Welcome back, {data.user?.name ?? email}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubmitting(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Submit a Task
          </button>
          <button
            type="button"
            onClick={() => setShowCtsModal(true)}
            className="animate-heartbeat-soft rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
          >
            CTS Form
          </button>
          <button
            type="button"
            onClick={handleAttendanceClick}
            disabled={attendanceNotYetOpen}
            title={attendanceNotYetOpen ? 'Opens at 6:00 AM (Singapore time)' : undefined}
            className={`rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold ${
              attendanceNotYetOpen
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Attendance Form
          </button>
        </div>
      </div>

      {showAttendanceEnded && (
        <Modal title="Attendance has ended" onClose={() => setShowAttendanceEnded(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Today's attendance window closes at 1:30 PM (Singapore time), and it's already past that.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAttendanceEnded(false)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showWarning && data.submitted_this_week === 0 && (
        <div className="fixed right-6 top-20 z-40 flex max-w-sm items-start gap-3 rounded-xl border-2 border-status-danger-text bg-status-danger-text px-5 py-4 text-sm font-semibold text-white shadow-lg">
          <span className="animate-heartbeat text-lg leading-none">⚠</span>
          <span className="flex-1">WARNING: No submissions logged yet this week.</span>
          <button
            onClick={dismissWarning}
            className="text-lg leading-none text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {submitting && <TaskSubmissionForm onClose={() => setSubmitting(false)} />}

      {showCtsModal && <CtsFormModal email={email} submissions={todaysSubmissions} onClose={() => setShowCtsModal(false)} />}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {quickLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-6 text-center hover:border-accent hover:bg-accent-bg"
          >
            <link.icon className="h-6 w-6 text-gray-500" strokeWidth={2} />
            <span className="text-sm font-semibold text-gray-700">{link.label}</span>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
          <ProgressRing value={dayProgress} label="Day Goal" sublabel={`${submittedToday} / ${dayTarget}`} />
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Submitted (Day)</div>
              <div className="text-xl font-bold text-gray-900">
                <CountUp value={submittedToday} />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Logged (Day)</div>
              <div className="text-xl font-bold text-gray-900">
                <CountUp value={loggedToday} />
              </div>
            </div>
            <div className="text-xs text-gray-400">Minimum goal — submit as much as you want, no upper limit.</div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Submission Trend</div>
            <span className="text-xs text-gray-400">last {TREND_DAYS} days</span>
          </div>
          <LineChart data={trendData} color="#d4a017" unitLabel="submitted" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-gray-700">By Stage (all-time)</div>
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
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-gray-700">By Project (all-time)</div>
          <div className="flex flex-col gap-3">
            {data.project_breakdown.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
            {data.project_breakdown.map((p, index) => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-gray-600" title={p.name}>
                  {p.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <GrowBar
                    className="h-full rounded-full bg-sky-600"
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
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Trophy className="h-4 w-4 text-amber-500" />
            Project Levels
          </div>
          <div className="divide-y divide-gray-100">
            {levelProjects.map(({ project, level }) => (
              <div key={project.id} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="font-medium uppercase tracking-wide text-gray-700">{project.name}</span>
                <LevelPill level={level} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Reveal>
  )
}
