import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useParams, Link } from 'react-router-dom'
import { Image, ChevronDown, MessageCircle, Trophy } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, functionErrorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, toISODate, formatRange, formatTime } from '../lib/week'
import { clearMustChangePassword, updateOwnProfile, uploadAvatar } from '../lib/profile'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import type { ContributorProfile, ContributorProjectLevel, Project, ProjectLevel, TaskSubmission } from '../types'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { ActionsMenu } from '../components/ActionsMenu'
import { StatusPill } from '../components/StatusPill'
import { LevelPill, LEVEL_TIERS } from '../components/LevelPill'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { BulkImportModal } from '../components/BulkImportModal'
import { CtsFormModal } from '../components/CtsFormModal'
import { SortableHeader } from '../components/SortableHeader'
import { ProgressRing } from '../components/ProgressRing'
import { LineChart } from '../components/LineChart'

const LEVEL_OPTIONS: ProjectLevel[] = ['contributor', 'l0', 'l1', 'l10']

const MANAGER_ROLES = ['admin', 'lead']

function LevelBadgePicker({ level, onChange }: { level: ProjectLevel; onChange: (level: ProjectLevel) => void }) {
  const [open, setOpen] = useState(false)
  const tier = LEVEL_TIERS[level]
  const Icon = tier.icon

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition hover:brightness-95 ${tier.badge} ${tier.ring ?? ''}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {tier.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
            {LEVEL_OPTIONS.map((option) => {
              const optionTier = LEVEL_TIERS[option]
              const OptionIcon = optionTier.icon
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onChange(option)
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-gray-50 ${
                    option === level ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${optionTier.badge}`}>
                    <OptionIcon className="h-3 w-3" />
                  </span>
                  {optionTier.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function CbProfile() {
  const { user: currentUser, refreshUser } = useAuth()
  const { email = '' } = useParams<{ email: string }>()
  const decodedEmail = decodeURIComponent(email)

  const isOwnProfile = currentUser?.email.toLowerCase() === decodedEmail.toLowerCase()

  const [formTarget, setFormTarget] = useState<'new' | TaskSubmission | null>(null)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [showCtsModal, setShowCtsModal] = useState(false)
  const [showWarning, setShowWarning] = useState(true)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null)
  const [profilePassword, setProfilePassword] = useState('')
  const [profilePasswordConfirm, setProfilePasswordConfirm] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setShowWarning(true)
    const timer = setTimeout(() => setShowWarning(false), 10000)
    return () => clearTimeout(timer)
  }, [decodedEmail])

  useEffect(() => {
    return () => {
      if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
    }
  }, [profilePhotoPreview])
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])

  type SortKey = 'task_id' | 'project' | 'stage' | 'status' | 'date'
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [page, setPage] = useState(1)
  const pageSize = 10

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['contributor', decodedEmail, thisWeekIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email: decodedEmail, week_start: thisWeekIso },
        })
      ).data,
    enabled: Boolean(decodedEmail),
  })

  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/task-submissions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const contributorId = data?.user?.id ?? null
  const contributorLeadId = data?.user?.lead_id ?? null

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  // A contributor's project list is exactly whichever projects their lead
  // runs — there's no separate "assign contributor to project" step.
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

  const levelMutation = useMutation({
    mutationFn: async ({ projectId, level }: { projectId: number; level: ProjectLevel }) => {
      const { error } = await supabase
        .from('contributor_project_levels')
        .upsert({ user_id: contributorId!, project_id: projectId, level }, { onConflict: 'user_id,project_id' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contributor-project-levels', contributorId] }),
  })

  const recommendationMutation = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke<{ recommendation: string }>(
        'lead-recommendation',
        {},
      )
      if (error) throw await functionErrorMessage(error)
      return result!.recommendation
    },
  })

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('Unauthenticated')
      let avatarUrl = currentUser.avatar_url
      if (profilePhotoFile) avatarUrl = await uploadAvatar(currentUser.id, profilePhotoFile)
      await updateOwnProfile(profileName.trim(), avatarUrl)
      if (profilePassword) {
        const { error } = await supabase.auth.updateUser({ password: profilePassword })
        if (error) throw error
        await clearMustChangePassword()
      }
    },
    onSuccess: async () => {
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['directory'] })
      setEditingProfile(false)
      setProfilePhotoFile(null)
      setProfilePhotoPreview(null)
      setProfilePassword('')
      setProfilePasswordConfirm('')
    },
    onError: (mutationError: Error) => setProfileError(mutationError.message || 'Could not save your profile.'),
  })

  function openEditProfile() {
    setProfileName(currentUser?.name ?? '')
    setProfilePhotoFile(null)
    setProfilePhotoPreview(null)
    setProfilePassword('')
    setProfilePasswordConfirm('')
    setProfileError(null)
    setEditingProfile(true)
  }

  function handlePhotoChange(file: File | null) {
    setProfilePhotoFile(file)
    setProfilePhotoPreview(file ? URL.createObjectURL(file) : null)
  }

  function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (profilePassword && profilePassword.length < 8) {
      setProfileError('New password must be at least 8 characters.')
      return
    }
    if (profilePassword !== profilePasswordConfirm) {
      setProfileError('New password and confirmation do not match.')
      return
    }
    setProfileError(null)
    saveProfileMutation.mutate()
  }

  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') return toISODate(startOfWeek(anchorDate))
    return toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1))
  }, [viewMode, anchorDate])

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') {
      const d = startOfWeek(anchorDate)
      d.setDate(d.getDate() + 6)
      return toISODate(d)
    }
    return toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0))
  }, [viewMode, anchorDate])

  const isCurrentRange = useMemo(() => {
    const today = new Date()
    if (viewMode === 'day') return rangeStart === toISODate(today)
    if (viewMode === 'week') return rangeStart === toISODate(startOfWeek(today))
    return anchorDate.getFullYear() === today.getFullYear() && anchorDate.getMonth() === today.getMonth()
  }, [viewMode, rangeStart, anchorDate])

  function shiftRange(direction: 1 | -1) {
    setAnchorDate((prev) => {
      const next = new Date(prev)
      if (viewMode === 'day') next.setDate(next.getDate() + direction)
      else if (viewMode === 'week') next.setDate(next.getDate() + direction * 7)
      else {
        next.setDate(1)
        next.setMonth(next.getMonth() + direction)
      }
      return next
    })
    setPage(1)
  }

  function rangeLabel(): string {
    if (viewMode === 'day') {
      return new Date(`${rangeStart}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    if (viewMode === 'week') return formatRange(rangeStart, rangeEnd)
    return anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-status-danger-text bg-status-danger-bg px-5 py-4 text-sm text-status-danger-text">
        Could not load this profile: {(error as Error).message}
      </div>
    )
  }

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  if (data.user && data.user.role !== 'contributor' && !isOwnProfile) {
    return <Navigate to="/" replace />
  }

  // data.is_public_view reflects whether the backend actually let us read the
  // privileged (per-row) data — role alone isn't reliable here, since e.g. a
  // lead who isn't THIS contributor's assigned lead still gets RLS-blocked
  // despite having the "lead" role. Gating on the role would show broken,
  // silently-empty edit UI for that case instead of correctly falling back.
  const canEdit = !data.is_public_view && (isOwnProfile || Boolean(currentUser && MANAGER_ROLES.includes(currentUser.role)))
  const isContributorRole = !data.user || data.user.role === 'contributor'
  const canManageLevels = !data.is_public_view && Boolean(currentUser && MANAGER_ROLES.includes(currentUser.role))
  // The direct table read below is RLS-scoped to self/lead/admin, so it
  // silently comes back empty for a peer contributor viewing someone else —
  // fall back to the levels bundled in the public stats RPC response instead.
  const effectiveProjectLevels = data.is_public_view ? (data.project_levels ?? []) : projectLevels
  const levelByProjectId = new Map(effectiveProjectLevels.map((row) => [row.project_id, row.level]))
  const levelProjects = leadProjectIds
    .map((id) => allProjects.find((project) => project.id === id))
    .filter((project): project is Project => Boolean(project))
    .map((project) => ({ project, level: levelByProjectId.get(project.id) ?? ('contributor' as ProjectLevel) }))

  const displayName = data.user?.name ?? decodedEmail
  const stages = Object.entries(data.stage_breakdown) as [string, number][]
  const maxStageTotal = Math.max(1, ...stages.map(([, total]) => total))
  const maxProjectTotal = Math.max(1, ...data.project_breakdown.map((p) => p.total))

  const TREND_DAYS = 30
  const trendData =
    data.submission_trend ??
    Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (TREND_DAYS - 1 - i))
      const iso = toISODate(d)
      const value = data.all_submissions.filter((r) => r.date?.slice(0, 10) === iso && r.status === 'submitted').length
      return { date: iso, value }
    })
  const visibleSubmissions = data.all_submissions.filter((row) => {
    const d = row.date?.slice(0, 10)
    return d && d >= rangeStart && d <= rangeEnd
  })
  const todaysSubmissions = data.all_submissions.filter(
    (row) =>
      row.date?.slice(0, 10) === toISODate(new Date()) && row.status !== 'in_progress' && !row.cts_submitted_at,
  )

  function sortValue(row: TaskSubmission): string {
    switch (sort.key) {
      case 'task_id':
        return row.task_id ?? ''
      case 'project':
        return row.project?.name ?? ''
      case 'stage':
        return row.stage
      case 'status':
        return row.status
      case 'date':
        return row.date ?? ''
    }
  }

  const sortedSubmissions = [...visibleSubmissions].sort((a, b) => {
    const cmp = sortValue(a).localeCompare(sortValue(b))
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const rangeTarget =
    viewMode === 'day'
      ? Math.round(data.weekly_target / 5)
      : viewMode === 'week'
        ? data.weekly_target
        : data.weekly_target * 4
  const submittedInRange = visibleSubmissions.filter((row) => row.status === 'submitted').length
  const loggedInRange = visibleSubmissions.length
  const rangeProgress = rangeTarget > 0 ? submittedInRange / rangeTarget : 0
  const viewLabel = viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'

  const totalPages = Math.max(1, Math.ceil(sortedSubmissions.length / pageSize))
  const pagedSubmissions = sortedSubmissions.slice((page - 1) * pageSize, page * pageSize)

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div>
      {canManageLevels && (
        <Link to="/" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-800">
          ← Back to Dashboard
        </Link>
      )}

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={displayName} photoUrl={isOwnProfile ? currentUser?.avatar_url : data.user?.avatar_url} size={56} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            {data.user && (
              <span className="rounded-full bg-accent-bg px-3 py-1 text-xs font-medium capitalize text-accent-foreground">
                {data.user.role}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{decodedEmail}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isOwnProfile && contributorId && (
            <Link
              to={`/messages/${contributorId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </Link>
          )}
          {isOwnProfile && (
            <button
              onClick={openEditProfile}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {showCtsModal && (
        <CtsFormModal email={decodedEmail} submissions={todaysSubmissions} onClose={() => setShowCtsModal(false)} />
      )}

      {editingProfile && (
        <Modal title="Edit Profile" onClose={() => setEditingProfile(false)}>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={profileName || displayName} photoUrl={profilePhotoPreview ?? currentUser?.avatar_url} size={64} />
              <div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Change Photo
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                disabled
                value={decodedEmail}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div className="border-t border-gray-100 pt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                minLength={8}
                placeholder="Leave blank to keep your current password"
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            {profilePassword && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Confirm New Password</label>
                <input
                  type="password"
                  minLength={8}
                  value={profilePasswordConfirm}
                  onChange={(e) => setProfilePasswordConfirm(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            )}
            {profileError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{profileError}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveProfileMutation.isPending || !profileName.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {saveProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {canEdit && isContributorRole && showWarning && data.submitted_this_week === 0 && (!data.user || data.user.is_active) && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-status-danger-text bg-status-danger-text px-5 py-4 text-sm font-semibold text-white shadow-sm">
          <span className="animate-heartbeat text-lg leading-none">⚠</span>
          <span>WARNING: No submissions logged yet this week.</span>
          <button
            onClick={() => setShowWarning(false)}
            className="ml-auto text-lg leading-none text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {canEdit && data.user?.shift && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Shift:</span> {data.user.shift}
          {data.user.meet_link && (
            <>
              <span className="mx-2 text-gray-300">|</span>
              <a href={data.user.meet_link} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                Meet link
              </a>
            </>
          )}
        </div>
      )}

      {isContributorRole && levelProjects.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Trophy className="h-4 w-4 text-amber-500" />
            Project Levels
          </div>
          <div className="divide-y divide-gray-100">
            {levelProjects.map(({ project, level }) => (
              <div key={project.id} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="font-medium uppercase tracking-wide text-gray-700">{project.name}</span>
                {canManageLevels ? (
                  <LevelBadgePicker
                    level={level}
                    onChange={(next) => levelMutation.mutate({ projectId: project.id, level: next })}
                  />
                ) : (
                  <LevelPill level={level} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwnProfile && data.user?.role === 'lead' && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Team Recommendations</div>
            <button
              onClick={() => recommendationMutation.mutate()}
              disabled={recommendationMutation.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {recommendationMutation.isPending
                ? 'Generating...'
                : recommendationMutation.data
                  ? 'Regenerate'
                  : 'Generate Recommendation'}
            </button>
          </div>
          {recommendationMutation.isError && (
            <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">
              {(recommendationMutation.error as Error).message}
            </div>
          )}
          {recommendationMutation.data ? (
            <div className="whitespace-pre-line text-sm text-gray-600">{recommendationMutation.data}</div>
          ) : (
            !recommendationMutation.isPending &&
            !recommendationMutation.isError && (
              <p className="text-sm text-gray-400">
                Generate an AI-powered summary of how your attached contributors are trending this week.
              </p>
            )
          )}
        </div>
      )}

      {isContributorRole && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Day/Week/Month Goal is derived from raw per-row submissions,
                which are deliberately empty in the public view — showing it
                there would just be a permanent, misleading 0. */}
            {!data.is_public_view && (
              <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
                <ProgressRing
                  value={rangeProgress}
                  label={`${viewLabel} Goal`}
                  sublabel={`${submittedInRange} / ${rangeTarget}`}
                />
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{`Submitted (${viewLabel})`}</div>
                    <div className="text-xl font-bold text-gray-900">{submittedInRange}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{`Logged (${viewLabel})`}</div>
                    <div className="text-xl font-bold text-gray-900">{loggedInRange}</div>
                  </div>
                  <div className="text-xs text-gray-400">Minimum goal — submit as much as you want, no upper limit.</div>
                </div>
              </div>
            )}

            <div className={`rounded-xl border border-gray-200 bg-white p-5 ${data.is_public_view ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-700">Submission Trend</div>
                <span className="text-xs text-gray-400">last {TREND_DAYS} days</span>
              </div>
              <LineChart data={trendData} color="#d4a017" unitLabel="submitted" />
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-3 text-sm font-semibold text-gray-700">By Stage (all-time)</div>
              <div className="flex flex-col gap-3">
                {stages.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
                {stages.map(([stage, total]) => (
                  <div key={stage} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 uppercase text-gray-600">{stage}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(4, (total / maxStageTotal) * 100)}%` }}
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
                {data.project_breakdown.map((p) => (
                  <div key={p.name} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 truncate text-gray-600" title={p.name}>
                      {p.name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-sky-600"
                        style={{ width: `${Math.max(4, (p.total / maxProjectTotal) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium text-gray-900">{p.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {canEdit && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg border border-gray-200 bg-white p-1">
                  {(['day', 'week', 'month'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setViewMode(mode)
                        setPage(1)
                      }}
                      className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${viewMode === mode ? 'bg-accent text-accent-foreground' : 'text-gray-600'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => shiftRange(-1)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  ← Prev
                </button>
                <div className="min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700">
                  {rangeLabel()}
                </div>
                <button
                  onClick={() => shiftRange(1)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Next →
                </button>
                {!isCurrentRange && (
                  <button
                    onClick={() => {
                      setAnchorDate(new Date())
                      setPage(1)
                    }}
                    className="text-sm font-medium text-sky-700 hover:underline"
                  >
                    Back to {viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'}
                  </button>
                )}

                {isContributorRole && (
                  <button
                    onClick={() => setShowCtsModal(true)}
                    className="ml-auto animate-heartbeat-soft rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
                  >
                    CTS Form
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => setBulkImporting(true)}
                    className={`rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 ${isContributorRole ? '' : 'ml-auto'}`}
                  >
                    Bulk Import
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => setFormTarget('new')}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                  >
                    + Add Submission
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700">
                  Submissions — {rangeLabel()}
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <SortableHeader
                        label="Task ID"
                        active={sort.key === 'task_id'}
                        dir={sort.dir}
                        onClick={() => toggleSort('task_id')}
                      />
                      <SortableHeader
                        label="Project"
                        active={sort.key === 'project'}
                        dir={sort.dir}
                        onClick={() => toggleSort('project')}
                      />
                      <SortableHeader
                        label="Stage"
                        active={sort.key === 'stage'}
                        dir={sort.dir}
                        onClick={() => toggleSort('stage')}
                      />
                      <SortableHeader
                        label="Status"
                        active={sort.key === 'status'}
                        dir={sort.dir}
                        onClick={() => toggleSort('status')}
                      />
                      <th className="px-5 py-3">CTS</th>
                      <SortableHeader
                        label="Date"
                        active={sort.key === 'date'}
                        dir={sort.dir}
                        onClick={() => toggleSort('date')}
                      />
                      {canEdit && <th className="px-5 py-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedSubmissions.length === 0 && (
                      <tr>
                        <td colSpan={canEdit ? 7 : 6} className="px-5 py-6 text-center text-gray-400">
                          No submissions for this {viewMode}.
                        </td>
                      </tr>
                    )}
                    {pagedSubmissions.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="max-w-40 truncate px-5 py-3 font-mono text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1.5">
                            {row.task_id ? (
                              <a
                                href={remotasksDiffViewerUrl(row.task_id)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-700 hover:underline"
                              >
                                {row.task_id}
                              </a>
                            ) : (
                              '—'
                            )}
                            {row.snipboard_url && (
                              <a
                                href={row.snipboard_url}
                                target="_blank"
                                rel="noreferrer"
                                title="View Snipboard.io screenshot"
                                className="text-gray-400 hover:text-sky-700"
                              >
                                <Image className="h-3.5 w-3.5" strokeWidth={2} />
                              </a>
                            )}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{row.project?.name ?? '—'}</td>
                        <td className="px-5 py-3 uppercase text-gray-600">{row.stage}</td>
                        <td className="px-5 py-3">
                          <StatusPill status={row.status} />
                        </td>
                        <td className="px-5 py-3">
                          {row.cts_submitted_at ? (
                            <span className="inline-flex items-center rounded-full bg-status-success-bg px-2.5 py-0.5 text-xs font-medium text-status-success-text">
                              Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-status-neutral-bg px-2.5 py-0.5 text-xs font-medium text-status-neutral-text">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {row.date?.slice(0, 10) ?? '—'}
                          {row.date && <span className="ml-1.5 text-xs text-gray-400">{formatTime(row.created_at)}</span>}
                        </td>
                        {canEdit && (
                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end">
                              <ActionsMenu
                                items={[
                                  { label: 'Edit', onClick: () => setFormTarget(row) },
                                  {
                                    label: 'Delete',
                                    variant: 'danger',
                                    onClick: () => {
                                      if (confirm('Delete this submission?')) {
                                        deleteMutation.mutate(row.id)
                                      }
                                    },
                                  },
                                ]}
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {sortedSubmissions.length > 0 && (
                  <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
                    <span>
                      Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedSubmissions.length)} of{' '}
                      {sortedSubmissions.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {formTarget && (
        <TaskSubmissionForm
          submission={formTarget === 'new' ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}

      {bulkImporting && (
        <BulkImportModal
          projects={allProjects}
          contributorEmail={decodedEmail}
          contributorName={displayName}
          onClose={() => setBulkImporting(false)}
        />
      )}
    </div>
  )
}
