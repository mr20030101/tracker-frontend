import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams, Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, Eye, MessageCircle, Pencil, Sparkles, Trophy, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, functionErrorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { weekStartIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import { isUserId, messagePath, parseContributorRef } from '../lib/urlRef'
import type { ContributorProfile, ContributorProjectLevel, Project, ProjectLevel } from '../types'
import { Avatar } from '../components/Avatar'
import { LevelPill, LEVEL_TIERS } from '../components/LevelPill'
import { ContributorWorkPanel } from '../components/ContributorWorkPanel'
import { Reveal } from '../components/Reveal'
import { AchievementsCard, FeaturedBadgeChip } from '../components/Achievements'
import { OnboardingProgress } from '../components/OnboardingChecklist'
import { useOnboardingStatus } from '../lib/onboarding'
import { recordProfileView, useProfileViewCount } from '../lib/profileViews'
import { useFeaturedBadges } from '../lib/achievements'
import { usePageTitle } from '../lib/usePageTitle'
import { fetchLeadShift, shiftLabel } from '../lib/taskRequests'

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
  const { user: currentUser } = useAuth()
  const { email: contributorRef = '' } = useParams<{ email: string }>()
  // The URL carries an email, or a user id when the viewer isn't allowed to know the email.
  const target = parseContributorRef(contributorRef)
  const targetIsId = isUserId(target)

  const isOwnProfile = targetIsId ? currentUser?.id === target : currentUser?.email.toLowerCase() === target.toLowerCase()

  const [showWarning, setShowWarning] = useState(true)

  useEffect(() => {
    setShowWarning(true)
    const timer = setTimeout(() => setShowWarning(false), 10000)
    return () => clearTimeout(timer)
  }, [target])

  const now = useNow(60_000)
  const thisWeekIso = weekStartIso(now)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['contributor', target, thisWeekIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: targetIsId ? { id: target, week_start: thisWeekIso } : { email: target, week_start: thisWeekIso },
        })
      ).data,
    enabled: Boolean(target),
  })

  // Empty for a peer opened by id: they aren't told the email, and the page just leaves it out.
  const decodedEmail = targetIsId ? (data?.cb_email ?? '') : target
  usePageTitle(data?.user?.name ?? (decodedEmail || 'Profile'))

  const queryClient = useQueryClient()

  const contributorId = data?.user?.id ?? null
  const contributorLeadId = data?.user?.lead_id ?? null

  // A lead's shift (when their contributors can send requests), shown on their profile, their own included.
  const { data: leadShift = null } = useQuery({
    queryKey: ['lead-shift', contributorId],
    queryFn: () => fetchLeadShift(contributorId!),
    enabled: Boolean(contributorId) && data?.user?.role === 'lead',
  })

  // Opening someone else's profile counts as a view (the database keeps one per viewer per day).
  // The count is refetched afterwards so it includes this visit.
  const viewCount = useProfileViewCount(contributorId)
  const { data: featuredBadges } = useFeaturedBadges(contributorId ? [contributorId] : [])
  useEffect(() => {
    if (!contributorId || isOwnProfile) return
    recordProfileView(contributorId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['profile-views', contributorId] }))
      .catch(() => {
        // A missed view isn't worth bothering the person about.
      })
  }, [contributorId, isOwnProfile, queryClient])

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

  // Null unless the viewer is this contributor's lead or an admin (the database leaves anyone else out).
  const isManagerViewer = Boolean(currentUser && MANAGER_ROLES.includes(currentUser.role))
  const { data: onboarding } = useOnboardingStatus(isManagerViewer && !isOwnProfile ? contributorId : null)

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

  // Everyone's profile is open to everyone, except the bot's: it has none to show.
  if (data.user?.is_bot) {
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
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to Dashboard
        </Link>
      )}

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={displayName} photoUrl={isOwnProfile ? currentUser?.avatar_url : data.user?.avatar_url} size={56} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              {displayName}
            </h1>
            {data.user && (
              <span className="rounded-full bg-accent-bg px-3 py-1 text-xs font-medium capitalize text-accent-foreground">
                {data.user.role}
              </span>
            )}
            {contributorId && <FeaturedBadgeChip badgeId={featuredBadges?.get(contributorId)} />}
          </div>
          {decodedEmail && <p className="text-sm text-gray-500">{decodedEmail}</p>}
          {(isOwnProfile ? currentUser?.bio : data.user?.bio) && (
            <p className="mt-1 max-w-xl text-sm text-gray-600">{isOwnProfile ? currentUser?.bio : data.user?.bio}</p>
          )}
          {viewCount.data && (
            <p
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
              title={`${viewCount.data.viewers} ${viewCount.data.viewers === 1 ? 'person has' : 'different people have'} viewed this profile`}
            >
              <Eye className="h-3.5 w-3.5" />
              {viewCount.data.views.toLocaleString()} profile {viewCount.data.views === 1 ? 'view' : 'views'}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isOwnProfile && contributorId && (
            <Link
              to={messagePath(contributorId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </Link>
          )}
          {isOwnProfile && (
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit Profile
            </Link>
          )}
        </div>
      </div>


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
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {(leadShift || (!isOwnProfile && data.user?.shift)) && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Shift:</span> {leadShift ? shiftLabel(leadShift) : data.user?.shift}
          {leadShift && <span className="ml-2 text-xs text-gray-400">Requests can be sent during this shift</span>}
          {data.user?.meet_link && (
            <>
              <span className="mx-2 text-gray-300">|</span>
              <a href={data.user.meet_link} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                Meet link
              </a>
            </>
          )}
        </div>
      )}

      {isContributorRole && !isOwnProfile && onboarding && onboarding.done < onboarding.total && (
        <OnboardingProgress status={onboarding} hasLead={Boolean(contributorLeadId)} />
      )}

      {isContributorRole && contributorId && <AchievementsCard userId={contributorId} canFeature={isOwnProfile} />}

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
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
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
      {isContributorRole && !isOwnProfile && decodedEmail && (
        <ContributorWorkPanel email={decodedEmail} contributorName={displayName} canEdit={canEdit} showGraphsToggle={false} />
      )}
    </Reveal>
  )
}
