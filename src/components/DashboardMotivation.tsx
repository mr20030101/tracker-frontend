import { Link } from 'react-router-dom'
import { CalendarCheck, Flame, Trophy, Users } from 'lucide-react'
import { GrowBar } from './GrowBar'
import { SpotlightDialog } from './SpotlightDialog'
import type { Standing } from '../lib/teamWeeks'

// The contributor dashboard's pull toward the Leaderboard and badges: where they stand this week
// and what it takes to move up, the team's shared goal, a warning when a streak is about to slip,
// and a recap of last week when a new one starts.

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

function standingLine(standing: Standing): string {
  if (standing.submitted === 0) return 'Submit a task to get on the board.'
  if (standing.above) return `${plural(standing.above.gap, 'more task')} to pass ${standing.above.name} at #${standing.rank - 1}.`
  if (standing.lead === undefined) return 'You’re the only one on the board so far.'
  if (standing.lead === 0) return 'Tied for first. One more task takes the lead!'
  return `You’re ahead by ${plural(standing.lead, 'task')}. Keep it up!`
}

export function TeamPulseCard({ standing, team }: { standing: Standing | undefined; team: { submitted: number; target: number } }) {
  const teamPct = team.target > 0 ? Math.min(100, (team.submitted / team.target) * 100) : 0
  const teamLeft = Math.max(0, team.target - team.submitted)

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      {standing && (
        <Link to="/leaderboard" className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 hover:border-accent">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Your rank this week</div>
            <div className="text-xl font-bold text-gray-900">
              #{standing.rank} <span className="text-sm font-medium text-gray-400">of {standing.of}</span>
            </div>
            <div className="text-sm text-gray-600">{standingLine(standing)}</div>
          </div>
          <span className="ml-auto hidden shrink-0 text-xs font-semibold text-accent group-hover:underline sm:block">Leaderboard →</span>
        </Link>
      )}
      {team.target > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Users className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Team goal this week</div>
              <div className="text-sm font-semibold text-gray-900">
                {team.submitted.toLocaleString()} <span className="font-normal text-gray-400">/ {team.target.toLocaleString()}</span>
              </div>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
              <GrowBar className={`h-full rounded-full ${teamLeft === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`} pct={teamPct} delay={300} />
            </div>
            <div className="mt-1.5 text-sm text-gray-600">
              {teamLeft === 0 ? 'Team goal reached. Amazing work, everyone!' : `${plural(teamLeft, 'task')} to go, together. Every one you submit counts.`}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** From the fourth day of the week (Friday), when a running streak hasn't been secured yet. */
const RISK_FROM_DAYS_LEFT = 4

export function StreakRiskCard({
  streak,
  submitted,
  target,
  daysLeft,
  onSubmit,
}: {
  streak: number
  submitted: number
  target: number
  daysLeft: number
  onSubmit: () => void
}) {
  const remaining = target - submitted
  if (streak <= 0 || remaining <= 0 || daysLeft > RISK_FROM_DAYS_LEFT) return null
  const perDay = Math.ceil(remaining / Math.max(1, daysLeft))

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-status-warning-text/30 bg-status-warning-bg p-4">
      <Flame className="animate-heartbeat h-8 w-8 shrink-0 text-status-warning-text" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-gray-900">
          {plural(remaining, 'more task')} to keep your {streak}-week streak alive!
        </div>
        <div className="text-sm text-gray-600">
          {daysLeft === 1 ? 'Today is the last day of the week.' : `${daysLeft} days left this week`}
          {daysLeft > 1 && `, about ${plural(perDay, 'task')} a day.`}
        </div>
      </div>
      <button type="button" onClick={onSubmit} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
        + Submit a Task
      </button>
    </div>
  )
}

export interface RecapStats {
  submitted: number
  target: number
  rank: number
  of: number
  streak: number
  nextTarget: number
}

export function WeeklyRecap({ stats, onSubmit, onClose }: { stats: RecapStats; onSubmit: () => void; onClose: () => void }) {
  const hit = stats.submitted > 0 && stats.submitted >= stats.target
  const short = stats.target - stats.submitted

  return (
    <SpotlightDialog
      icon={CalendarCheck}
      title="Your week in review"
      primary={{ label: '+ Submit a Task', onClick: onSubmit }}
      secondary={{ label: 'Let’s go', onClick: onClose }}
      onClose={onClose}
    >
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 px-2 py-3">
          <div className="text-lg font-bold text-gray-900">{stats.submitted.toLocaleString()}</div>
          <div className="text-xs text-gray-500">tasks</div>
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-3">
          <div className="text-lg font-bold text-gray-900">
            #{stats.rank}
            <span className="text-xs font-medium text-gray-400"> /{stats.of}</span>
          </div>
          <div className="text-xs text-gray-500">on the board</div>
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-3">
          <div className="flex items-center justify-center gap-1 text-lg font-bold text-gray-900">
            <Flame className={`h-4 w-4 ${stats.streak ? 'text-orange-500' : 'text-gray-300'}`} />
            {stats.streak}
          </div>
          <div className="text-xs text-gray-500">week streak</div>
        </div>
      </div>
      <p className="mt-3">
        {hit
          ? `You hit your target of ${stats.target}. `
          : stats.submitted > 0
            ? `Just ${plural(short, 'task')} short of your ${stats.target} target. `
            : 'A quiet week. That’s okay, this one is a fresh start. '}
        This week’s target is <span className="font-semibold text-gray-900">{stats.nextTarget}</span>. Let’s make it count!
      </p>
    </SpotlightDialog>
  )
}
