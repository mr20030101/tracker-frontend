import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams, Link } from 'react-router-dom'
import { Camera, ChevronDown, Lock, MessageCircle, Trophy } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, functionErrorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, toISODate } from '../lib/week'
import { clearMustChangePassword, updateOwnProfile, uploadAvatar } from '../lib/profile'
import type { ContributorProfile, ContributorProjectLevel, Project, ProjectLevel } from '../types'
import { Avatar } from '../components/Avatar'
import { LevelPill, LEVEL_TIERS } from '../components/LevelPill'
import { ContributorWorkPanel } from '../components/ContributorWorkPanel'
import { Reveal } from '../components/Reveal'

const LEVEL_OPTIONS: ProjectLevel[] = ['contributor', 'l0', 'l1', 'l10']

const MANAGER_ROLES = ['admin', 'lead']

const LEVEL_PANEL_WIDTH = 160
const LEVEL_PANEL_EDGE_GAP = 8
// Above Modal's z-50, so a panel opened inside a modal isn't covered by it.
const LEVEL_PANEL_Z_INDEX = 60

function LevelBadgePicker({ level, onChange }: { level: ProjectLevel; onChange: (level: ProjectLevel) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tier = LEVEL_TIERS[level]
  const Icon = tier.icon

  // Fixed-position panel, measured against the button: never clipped by a card's
  // overflow-hidden edge, and flips upward if there isn't room below.
  useLayoutEffect(() => {
    const button = buttonRef.current
    if (!open || !button) return
    const rect = button.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - LEVEL_PANEL_EDGE_GAP
    const openUp = below < 200 && rect.top > below
    setPos({
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      right: window.innerWidth - rect.right,
    })
  }, [open])

  function close() {
    setOpen(false)
    setPos(null)
  }

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition hover:brightness-95 ${tier.badge} ${tier.ring ?? ''}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {tier.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: LEVEL_PANEL_Z_INDEX }} onClick={close} />
            <div
              style={{ position: 'fixed', zIndex: LEVEL_PANEL_Z_INDEX + 1, width: LEVEL_PANEL_WIDTH, ...pos }}
              className="rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
            >
              {LEVEL_OPTIONS.map((option) => {
                const optionTier = LEVEL_TIERS[option]
                const OptionIcon = optionTier.icon
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      close()
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
          </>,
          document.body,
        )}
    </div>
  )
}

export function CbProfile() {
  const { user: currentUser, refreshUser } = useAuth()
  const { email = '' } = useParams<{ email: string }>()
  const decodedEmail = decodeURIComponent(email)

  const isOwnProfile = currentUser?.email.toLowerCase() === decodedEmail.toLowerCase()

  const [showWarning, setShowWarning] = useState(true)
  const [profileName, setProfileName] = useState(() => currentUser?.name ?? '')
  const [profileRemotasksId, setProfileRemotasksId] = useState(() => currentUser?.remotasks_id ?? '')
  const [profileShift, setProfileShift] = useState(() => currentUser?.shift ?? '')
  const [profileBio, setProfileBio] = useState(() => currentUser?.bio ?? '')
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
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])

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
      await updateOwnProfile(profileName.trim(), avatarUrl, profileRemotasksId.trim(), profileShift.trim(), profileBio.trim())
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
      setProfilePhotoFile(null)
      setProfilePhotoPreview(null)
      setProfilePassword('')
      setProfilePasswordConfirm('')
    },
    onError: (mutationError: Error) => setProfileError(mutationError.message || 'Could not save your profile.'),
  })

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

  return (
    <Reveal>
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
          {(isOwnProfile ? currentUser?.bio : data.user?.bio) && (
            <p className="mt-1 max-w-xl text-sm text-gray-600">{isOwnProfile ? currentUser?.bio : data.user?.bio}</p>
          )}
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
        </div>
      </div>

      {isOwnProfile && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-5 text-sm font-semibold text-gray-700">Edit Profile</h2>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <div className="group relative shrink-0">
                <Avatar name={profileName || displayName} photoUrl={profilePhotoPreview ?? currentUser?.avatar_url} size={72} />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Change photo"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-accent text-accent-foreground shadow-sm hover:brightness-95"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{profileName || displayName}</div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="text-xs font-medium text-sky-700 hover:underline"
                >
                  Change photo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Remotask ID</label>
                <input
                  value={profileRemotasksId}
                  onChange={(e) => setProfileRemotasksId(e.target.value)}
                  placeholder="Your Remotasks worker ID"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-xs text-gray-400">Prefills the Reclaim / Extend form when your lead approves an extension.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Shift</label>
                <input
                  value={profileShift}
                  onChange={(e) => setProfileShift(e.target.value)}
                  placeholder="e.g. 9 AM – 5 PM PHT"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-xs text-gray-400">Shown on your profile so your lead knows when you're online.</p>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                  Email
                </label>
                <input
                  disabled
                  value={decodedEmail}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Bio</label>
                <span className="text-xs text-gray-400">{profileBio.length}/240</span>
              </div>
              <textarea
                rows={2}
                maxLength={240}
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                placeholder="A short line about yourself — shown on your profile."
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            <div className="border-t border-gray-100 pt-5">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Lock className="h-3.5 w-3.5 text-gray-400" />
                Password
              </div>
              <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                minLength={8}
                placeholder="Leave blank to keep your current password"
                value={profilePassword}
                onChange={(e) => setProfilePassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {profilePassword && (
                <div className="mt-4">
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
            </div>

            {profileError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{profileError}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={saveProfileMutation.isPending || !profileName.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {saveProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* A CB's own "no submissions yet" nudge lives on their Dashboard now; keep it here only
          for a lead/admin reviewing someone else. */}
      {canEdit && isContributorRole && !isOwnProfile && showWarning && data.submitted_this_week === 0 && (!data.user || data.user.is_active) && (
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

      {!isOwnProfile && data.user?.shift && (
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

      {/* Same for Project Levels — a CB sees their own on the Dashboard now; this stays only
          for a lead/admin reviewing someone else. */}
      {isContributorRole && !isOwnProfile && levelProjects.length > 0 && (
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

      {/* A contributor's own graphs/table live on their own Task Log now; this page keeps them
          only for someone else reviewing this contributor (a lead/admin, or a public view). */}
      {isContributorRole && !isOwnProfile && (
        <ContributorWorkPanel email={decodedEmail} contributorName={displayName} canEdit={canEdit} showGraphsToggle={false} />
      )}
    </Reveal>
  )
}
