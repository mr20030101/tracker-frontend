import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CalendarDays, Check, ChevronDown, ChevronUp, Gift, Plus, Trash2, Trophy, Users, X } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { toISODate, formatRange } from '../lib/week'
import { usePageTitle } from '../lib/usePageTitle'
import {
  RULE_LABELS,
  awardReward,
  cancelReward,
  createReward,
  describePrize,
  describeRule,
  formatMoney,
  myStandingLine,
  ordinal,
  countFullWeeks,
  presetRange,
  rewardPhase,
  setRewardPaid,
  useRewardStandings,
  useRewardWinners,
  useRewards,
  type Reward,
  type RewardPhase,
  type RewardRule,
  type RewardStanding,
  type RewardWinner,
} from '../lib/rewards'
import type { Project } from '../types'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'
import { Reveal } from '../components/Reveal'
import { contributorPathById } from '../lib/urlRef'

// Rewards: prizes a lead offers their team (or an admin offers anyone) for a rule over a date
// range. Everyone sees what's running and how they're doing; managers create, award and mark paid.

const MANAGER_ROLES = ['admin', 'lead']

const PHASE_STYLES: Record<RewardPhase, { label: string; className: string }> = {
  live: { label: 'Live', className: 'bg-status-success-bg text-status-success-text' },
  upcoming: { label: 'Upcoming', className: 'bg-sky-100 text-sky-700' },
  ended: { label: 'Ended', className: 'bg-status-warning-bg text-status-warning-text' },
  awarded: { label: 'Awarded', className: 'bg-status-neutral-bg text-status-neutral-text' },
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

function whenLine(reward: Reward, phase: RewardPhase, today: string): string {
  if (phase === 'upcoming') {
    const days = daysBetween(today, reward.starts_on)
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`
  }
  if (phase === 'live') {
    const days = daysBetween(today, reward.ends_on)
    return days === 0 ? 'Ends today' : days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`
  }
  return phase === 'ended' ? 'Ended, winners coming soon' : 'Winners announced'
}

export function Rewards() {
  usePageTitle('Rewards')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const [creating, setCreating] = useState(false)
  const { data: rewards = [], isLoading, isError } = useRewards()
  const { data: winners = [] } = useRewardWinners()
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })
  const today = toISODate(new Date())

  const groups = useMemo(() => {
    const by: Record<RewardPhase, Reward[]> = { live: [], upcoming: [], ended: [], awarded: [] }
    for (const reward of rewards) by[rewardPhase(reward, today)].push(reward)
    by.upcoming.sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    by.live.sort((a, b) => a.ends_on.localeCompare(b.ends_on))
    return by
  }, [rewards, today])

  const sections: { phase: RewardPhase; title: string }[] = [
    { phase: 'ended', title: isManager ? 'Ready to award' : 'Just ended' },
    { phase: 'live', title: 'Running now' },
    { phase: 'upcoming', title: 'Coming up' },
    { phase: 'awarded', title: 'Past rewards' },
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Gift className="h-6 w-6 text-accent" />
            Rewards
          </h1>
          <p className="text-sm text-gray-500">
            {isManager ? 'Offer your team a prize for hitting a goal, and pay out the winners.' : 'Prizes up for grabs, and how close you are to winning them.'}
          </p>
        </div>
        {isManager && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <Plus className="h-4 w-4" />
            New reward
          </button>
        )}
      </div>

      {creating && <NewRewardModal projects={projects} onClose={() => setCreating(false)} />}

      {isLoading && <div className="text-gray-400">Loading...</div>}
      {isError && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-6 text-center text-gray-500">
          Rewards aren’t set up yet. The database needs the rewards update first.
        </div>
      )}
      {!isLoading && !isError && rewards.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-5 py-10 text-center">
          <Gift className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <div className="font-semibold text-gray-700">No rewards yet</div>
          <div className="text-sm text-gray-500">
            {isManager ? 'Create one to give your team something to go for.' : 'When your lead offers a reward, it’ll show up here.'}
          </div>
        </div>
      )}

      {sections.map(({ phase, title }) =>
        groups[phase].length > 0 ? (
          <section key={phase} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
            <Reveal className="flex flex-col gap-4">
              {groups[phase].map((reward) => (
                <RewardCard
                  key={reward.id}
                  reward={reward}
                  phase={phase}
                  today={today}
                  isManager={isManager}
                  isAdmin={user?.role === 'admin'}
                  meId={user?.id}
                  projectName={projects.find((p) => p.id === reward.project_id)?.name}
                  winners={winners.filter((w) => w.reward_id === reward.id)}
                />
              ))}
            </Reveal>
          </section>
        ) : null,
      )}
    </div>
  )
}

function RewardCard({
  reward,
  phase,
  today,
  isManager,
  isAdmin,
  meId,
  projectName,
  winners,
}: {
  reward: Reward
  phase: RewardPhase
  today: string
  isManager: boolean
  isAdmin: boolean
  meId: string | undefined
  projectName: string | undefined
  winners: RewardWinner[]
}) {
  const { usersById } = useMessaging()
  const queryClient = useQueryClient()
  const [awarding, setAwarding] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const showStandings = phase === 'live' || phase === 'ended'
  const { data: standings = [] } = useRewardStandings(reward.id, showStandings || phase === 'awarded')
  // Mirrors can_manage_reward(): admins manage everything, a lead only their own team's.
  const canManage = isAdmin || (isManager && reward.team_lead_id === meId)
  const style = PHASE_STYLES[phase]
  const audience = reward.team_lead_id ? `${usersById.get(reward.team_lead_id)?.name ?? 'A lead'}’s team` : 'Everyone'
  const mine = phase === 'live' ? myStandingLine(reward, standings, meId) : undefined

  const cancel = useMutation({
    mutationFn: () => cancelReward(reward.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rewards'] }),
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">{reward.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>{style.label}</span>
          </div>
          <div className="mt-0.5 text-lg font-bold text-accent">{describePrize(reward)}</div>
          <p className="mt-1 text-sm text-gray-700">{describeRule(reward, projectName)}</p>
          {reward.description && <p className="mt-1 whitespace-pre-line text-sm text-gray-500">{reward.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatRange(reward.starts_on, reward.ends_on)} · {whenLine(reward, phase, today)}
            </span>
            {isManager && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {audience}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {phase === 'ended' && (
              <button type="button" onClick={() => setAwarding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
                <Award className="h-4 w-4" aria-hidden />
                Award winners
              </button>
            )}
            {(phase === 'live' || phase === 'upcoming' || phase === 'ended') && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {mine && <div className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm font-semibold text-gray-900">{mine}</div>}

      {showStandings && reward.rule !== 'custom' && <StandingsList reward={reward} standings={standings} meId={meId} />}
      {showStandings && reward.rule === 'custom' && isManager && <StandingsList reward={reward} standings={standings} meId={meId} />}

      {phase === 'awarded' && <WinnersList reward={reward} winners={winners} standings={standings} canManage={canManage} />}

      {awarding && <AwardModal reward={reward} standings={standings} onClose={() => setAwarding(false)} />}
      {confirmCancel && (
        <Modal title="Cancel this reward?" onClose={() => setConfirmCancel(false)}>
          <p className="text-sm text-gray-600">“{reward.title}” will be removed for everyone. This can’t be undone.</p>
          {cancel.isError && <p className="mt-2 text-sm text-red-600">{errorMessage(cancel.error, 'Could not cancel it.')}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmCancel(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
              <X className="h-4 w-4" aria-hidden />
              Keep it
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {cancel.isPending ? 'Cancelling...' : 'Cancel reward'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const STANDINGS_SHOWN = 10

function StandingsList({ reward, standings, meId }: { reward: Reward; standings: RewardStanding[]; meId: string | undefined }) {
  const [all, setAll] = useState(false)
  if (standings.length === 0) return null
  const shown = all ? standings : standings.slice(0, STANDINGS_SHOWN)
  const goal = reward.rule === 'min_tasks' ? (reward.threshold ?? 1) : Math.max(1, standings[0]?.submitted ?? 1)

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <ul className="divide-y divide-gray-100">
        {shown.map((s, index) => {
          const isMe = s.user_id === meId
          const pct =
            reward.rule === 'every_week_on_target'
              ? s.weeks_total > 0
                ? (s.weeks_hit / s.weeks_total) * 100
                : 0
              : Math.min(100, (s.submitted / goal) * 100)
          return (
            <li key={s.user_id} className={`-mx-2 flex items-center gap-3 px-2 py-2 ${isMe ? 'rounded-lg bg-accent-bg/40' : ''}`}>
              <span className="w-7 shrink-0 text-center text-sm font-semibold text-gray-400">
                {reward.rule === 'top_submitters' ? (s.place ?? index + 1) : ''}
                {reward.rule !== 'top_submitters' && s.qualifies && <Check className="mx-auto h-4 w-4 text-emerald-500" />}
              </span>
              <Avatar name={s.name} photoUrl={s.avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <Link to={contributorPathById(s.user_id)} className="block truncate text-sm font-medium text-gray-900 hover:underline">
                  {s.name}
                  {isMe && <span className="ml-2 text-xs font-semibold text-accent">You</span>}
                </Link>
                <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${s.qualifies ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-gray-900">
                {reward.rule === 'every_week_on_target' ? (
                  <>
                    {s.weeks_hit}/{s.weeks_total} <span className="font-normal text-gray-400">weeks</span>
                  </>
                ) : (
                  <>
                    {s.submitted.toLocaleString()} <span className="font-normal text-gray-400">tasks</span>
                  </>
                )}
              </span>
              {reward.rule === 'top_submitters' && s.qualifies && s.place && (
                <span className="hidden shrink-0 text-xs font-semibold text-emerald-600 sm:block">
                  {formatMoney(reward.prize_amounts[s.place - 1], reward.currency)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {standings.length > STANDINGS_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
          {all ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          {all ? 'Show fewer' : `Show all ${standings.length}`}
        </button>
      )}
    </div>
  )
}

function WinnersList({
  reward,
  winners,
  standings,
  canManage,
}: {
  reward: Reward
  winners: RewardWinner[]
  standings: RewardStanding[]
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const pay = useMutation({
    mutationFn: ({ userId, paid }: { userId: string; paid: boolean }) => setRewardPaid(reward.id, userId, paid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reward-winners'] }),
  })
  const person = (id: string) => standings.find((s) => s.user_id === id)
  const total = winners.reduce((sum, w) => sum + w.amount, 0)
  const paid = winners.filter((w) => w.paid_at).length

  if (winners.length === 0) {
    return <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500">Nobody met the rule this time.</div>
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span className="font-semibold uppercase tracking-wider">Winners</span>
        {canManage && (
          <span>
            {formatMoney(total, reward.currency)} total · {paid} of {winners.length} paid
          </span>
        )}
      </div>
      <ul className="divide-y divide-gray-100">
        {winners.map((w) => {
          const p = person(w.user_id)
          return (
            <li key={w.user_id} className="flex items-center gap-3 py-2">
              <span className="w-9 shrink-0 text-center text-sm font-semibold text-gray-400">{ordinal(w.place)}</span>
              <Avatar name={p?.name ?? '?'} photoUrl={p?.avatar_url ?? null} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{p?.name ?? 'Former member'}</span>
              <span className="shrink-0 text-sm font-semibold text-gray-900">{formatMoney(w.amount, reward.currency)}</span>
              {canManage ? (
                <button
                  type="button"
                  disabled={pay.isPending}
                  onClick={() => pay.mutate({ userId: w.user_id, paid: !w.paid_at })}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    w.paid_at ? 'bg-status-success-bg text-status-success-text' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title={w.paid_at ? 'Paid. Click to mark unpaid.' : 'Mark as paid'}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {w.paid_at ? 'Paid' : 'Mark paid'}
                </button>
              ) : (
                w.paid_at && <span className="shrink-0 text-xs font-semibold text-status-success-text">Paid</span>
              )}
            </li>
          )
        })}
      </ul>
      {pay.isError && <p className="mt-2 text-xs text-red-600">{errorMessage(pay.error, 'Could not update it.')}</p>}
    </div>
  )
}

function AwardModal({ reward, standings, onClose }: { reward: Reward; standings: RewardStanding[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<string[]>([])
  const [announce, setAnnounce] = useState(true)
  const custom = reward.rule === 'custom'
  const automatic = standings.filter((s) => s.qualifies)
  const amountFor = (index: number, s?: RewardStanding) =>
    reward.rule === 'top_submitters' && s?.place
      ? reward.prize_amounts[s.place - 1]
      : reward.prize_amounts[Math.min(index, reward.prize_amounts.length - 1)] ?? reward.prize_amounts[0]

  const award = useMutation({
    mutationFn: () => awardReward(reward.id, custom ? picked : null, announce),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      queryClient.invalidateQueries({ queryKey: ['reward-winners'] })
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      onClose()
    },
  })

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    award.mutate()
  }

  const winners = custom ? picked.map((id) => standings.find((s) => s.user_id === id)!).filter(Boolean) : automatic
  const total = winners.reduce((sum, s, i) => sum + amountFor(i, s), 0)

  return (
    <Modal title={`Award “${reward.title}”`} onClose={onClose} maxWidthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {custom ? (
          <div>
            <p className="mb-2 text-sm text-gray-600">Pick the winners in order: the first you pick is 1st place.</p>
            <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {standings.map((s) => {
                const order = picked.indexOf(s.user_id)
                return (
                  <li key={s.user_id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                      <input type="checkbox" checked={order >= 0} onChange={() => toggle(s.user_id)} />
                      <Avatar name={s.name} photoUrl={s.avatar_url} size={24} />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-400">{s.submitted} tasks</span>
                      {order >= 0 && <span className="w-16 text-right text-xs font-semibold text-accent">{ordinal(order + 1)} · {formatMoney(amountFor(order), reward.currency)}</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : automatic.length === 0 ? (
          <p className="text-sm text-gray-600">Nobody met the rule. Awarding it closes the reward with no winners.</p>
        ) : (
          <div>
            <p className="mb-2 text-sm text-gray-600">These are the winners by the rule:</p>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {automatic.map((s, i) => (
                <li key={s.user_id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-8 text-sm font-semibold text-gray-400">{ordinal(s.place ?? i + 1)}</span>
                  <Avatar name={s.name} photoUrl={s.avatar_url} size={24} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{s.name}</span>
                  <span className="text-xs text-gray-400">{s.submitted} tasks</span>
                  <span className="text-sm font-semibold text-gray-900">{formatMoney(amountFor(i, s), reward.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {winners.length > 0 && (
          <div className="text-right text-sm text-gray-600">
            Total payout: <span className="font-bold text-gray-900">{formatMoney(total, reward.currency)}</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
          Announce the winners
        </label>
        {award.isError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{errorMessage(award.error, 'Could not award it.')}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Not yet
          </button>
          <button
            type="submit"
            disabled={award.isPending || (custom && picked.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Award className="h-4 w-4" aria-hidden />
            {award.isPending ? 'Awarding...' : 'Award'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

type Preset = 'next_week' | 'this_week' | 'next_month' | 'this_month' | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'next_week', label: 'Next week' },
  { value: 'this_week', label: 'Rest of this week' },
  { value: 'next_month', label: 'Next month' },
  { value: 'this_month', label: 'Rest of this month' },
  { value: 'custom', label: 'Custom dates' },
]

function NewRewardModal({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { usersById } = useMessaging()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [teamLeadId, setTeamLeadId] = useState(isAdmin ? '' : (user?.id ?? ''))
  const [rule, setRule] = useState<RewardRule>('top_submitters')
  const [threshold, setThreshold] = useState('')
  const [places, setPlaces] = useState(1)
  const [projectId, setProjectId] = useState('')
  const [prizes, setPrizes] = useState<string[]>(['1000'])
  const [currency, setCurrency] = useState('PHP')
  const [prizeNote, setPrizeNote] = useState('')
  const [preset, setPreset] = useState<Preset>('next_week')
  const [range, setRange] = useState<[string, string]>(() => presetRange('next_week'))
  const [announce, setAnnounce] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)

  const leads = useMemo(
    () => [...usersById.values()].filter((u) => u.role === 'lead' && !u.is_bot).sort((a, b) => a.name.localeCompare(b.name)),
    [usersById],
  )

  const prizeSlots = rule === 'top_submitters' ? places : rule === 'custom' ? prizes.length : 1

  function choosePreset(value: Preset) {
    setPreset(value)
    if (value !== 'custom') setRange(presetRange(value))
  }

  function choosePlaces(n: number) {
    setPlaces(n)
    setPrizes((current) => Array.from({ length: n }, (_, i) => current[i] ?? ''))
  }

  function chooseRule(value: RewardRule) {
    setRule(value)
    if (value !== 'top_submitters') setPrizes((current) => current.slice(0, 1))
    else setPrizes((current) => Array.from({ length: places }, (_, i) => current[i] ?? ''))
  }

  const create = useMutation({
    mutationFn: createReward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      onClose()
    },
    onError: (err) => setFormError(errorMessage(err, 'Could not create the reward.')),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const amounts = prizes.slice(0, prizeSlots).map((p) => Number(p))
    if (amounts.some((a) => !Number.isFinite(a) || a < 0) || amounts.length === 0) return setFormError('Enter a prize amount for each place.')
    if (rule === 'min_tasks' && !(Number(threshold) >= 1)) return setFormError('How many tasks does it take?')
    if (range[1] < range[0]) return setFormError('The end date is before the start date.')
    if (rule === 'every_week_on_target' && countFullWeeks(range[0], range[1]) === 0)
      return setFormError('This date range contains no full Tuesday–Monday week, so "On target every week" can never be won. Extend the range to include at least one complete week.')
    setFormError(null)
    create.mutate({
      title: title.trim(),
      description: description.trim(),
      team_lead_id: isAdmin ? teamLeadId || null : (user?.id ?? null),
      rule,
      threshold: (rule === 'min_tasks' || rule === 'top_submitters') && threshold ? Number(threshold) : null,
      places: rule === 'top_submitters' ? places : 1,
      project_id: projectId ? Number(projectId) : null,
      prize_amounts: amounts,
      currency,
      prize_note: prizeNote.trim(),
      starts_on: range[0],
      ends_on: range[1],
      announce,
    })
  }

  const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700'
  const previewReward = {
    rule,
    places: rule === 'top_submitters' ? places : 1,
    threshold: threshold ? Number(threshold) : null,
    prize_amounts: prizes.slice(0, prizeSlots).map((p) => Number(p) || 0),
    currency,
    prize_note: prizeNote.trim() || null,
  }

  return (
    <Modal title="New reward" onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Title</label>
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Top submitter of the week"
            className={fieldClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Rule</label>
            <Select
              value={rule}
              onChange={(value) => chooseRule(value as RewardRule)}
              options={(Object.keys(RULE_LABELS) as RewardRule[]).map((r) => ({ value: r, label: RULE_LABELS[r] }))}
              fullWidth
              className={fieldClass}
            />
          </div>
          {rule === 'top_submitters' && (
            <div>
              <label className={labelClass}>Prize places</label>
              <Select
                value={String(places)}
                onChange={(value) => choosePlaces(Number(value))}
                options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1st place only' : `Top ${i + 1}` }))}
                fullWidth
                className={fieldClass}
              />
            </div>
          )}
          {(rule === 'min_tasks' || rule === 'top_submitters') && (
            <div>
              <label className={labelClass}>{rule === 'min_tasks' ? 'Tasks needed' : 'Minimum to qualify (optional)'}</label>
              <input
                type="number"
                min={1}
                required={rule === 'min_tasks'}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={rule === 'min_tasks' ? 'e.g. 60' : 'No minimum'}
                className={fieldClass}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Count tasks from</label>
            <Select
              value={projectId}
              onChange={setProjectId}
              options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
              fullWidth
              className={fieldClass}
            />
          </div>
          {isAdmin && (
            <div>
              <label className={labelClass}>For</label>
              <Select
                value={teamLeadId}
                onChange={setTeamLeadId}
                options={[{ value: '', label: 'Everyone' }, ...leads.map((l) => ({ value: l.id, label: `${l.name}'s team` }))]}
                fullWidth
                className={fieldClass}
              />
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Prize{prizeSlots > 1 ? 's' : ''}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
              className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700"
            >
              <option value="PHP">PHP ₱</option>
              <option value="USD">USD $</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: prizeSlots }, (_, i) => (
              <div key={i}>
                {prizeSlots > 1 && <div className="mb-0.5 text-xs text-gray-500">{ordinal(i + 1)} place</div>}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={prizes[i] ?? ''}
                  onChange={(e) => setPrizes((current) => Object.assign([...current], { [i]: e.target.value }))}
                  placeholder="1000"
                  className={fieldClass}
                />
              </div>
            ))}
          </div>
          {rule === 'custom' && (
            <div className="mt-1 flex gap-3 text-xs">
              {prizes.length < 10 && (
                <button type="button" onClick={() => setPrizes([...prizes, ''])} className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Different prize for the next place
                </button>
              )}
              {prizes.length > 1 && (
                <button type="button" onClick={() => setPrizes(prizes.slice(0, -1))} className="inline-flex items-center gap-1.5 font-semibold text-gray-500 hover:underline">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove last
                </button>
              )}
            </div>
          )}
          <input
            maxLength={200}
            value={prizeNote}
            onChange={(e) => setPrizeNote(e.target.value)}
            placeholder="Anything extra? e.g. + a shout-out in the team meeting"
            className={`${fieldClass} mt-2`}
          />
        </div>

        <div>
          <label className={labelClass}>When</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => choosePreset(p.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${preset === p.value ? 'bg-accent text-accent-foreground' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              required
              min={toISODate(new Date())}
              value={range[0]}
              onChange={(e) => {
                setPreset('custom')
                setRange([e.target.value, range[1]])
              }}
              className={fieldClass}
              aria-label="Starts"
            />
            <input
              type="date"
              required
              min={range[0]}
              value={range[1]}
              onChange={(e) => {
                setPreset('custom')
                setRange([range[0], e.target.value])
              }}
              className={fieldClass}
              aria-label="Ends"
            />
          </div>
          {rule === 'every_week_on_target' && <p className="mt-1 text-xs text-gray-500">Counts each full business week (Tuesday to Monday) inside these dates.</p>}
        </div>

        <div>
          <label className={labelClass}>Details (optional)</label>
          <textarea
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={rule === 'custom' ? 'Explain the rule, e.g. best quality feedback from reviewers' : 'Anything else your team should know'}
            className={`${fieldClass} resize-y`}
          />
        </div>

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <div className="font-semibold text-gray-900">{describePrize(previewReward)}</div>
          <div className="text-gray-600">{describeRule(previewReward, projects.find((p) => String(p.id) === projectId)?.name)}</div>
          <div className="text-xs text-gray-500">{range[0] && range[1] ? formatRange(range[0], range[1]) : ''}</div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
          Post it as an announcement
        </label>
        {formError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{formError}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {create.isPending ? 'Creating...' : 'Create reward'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
