import { Link } from 'react-router-dom'
import { ArrowRight, Gift } from 'lucide-react'
import { describePrize, myStandingLine, rewardPhase, useRewardStandings, useRewards, type Reward } from '../lib/rewards'
import { toISODate } from '../lib/week'

// The contributor dashboard's look at the rewards they can win right now (and any about to start),
// each with how they're doing on it. Nothing when there aren't any.

const SHOWN = 3

export function RewardsSpotlight({ meId }: { meId: string }) {
  const { data: rewards = [] } = useRewards()
  const today = toISODate(new Date())
  const open = rewards
    .filter((r) => {
      const phase = rewardPhase(r, today)
      return phase === 'live' || phase === 'upcoming'
    })
    .sort((a, b) => a.ends_on.localeCompare(b.ends_on))
    .slice(0, SHOWN)
  if (open.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-accent/40 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Gift className="h-4 w-4 text-accent" />
          Rewards up for grabs
        </div>
        <Link to="/rewards" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          See all
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {open.map((reward) => (
          <RewardLine key={reward.id} reward={reward} meId={meId} today={today} />
        ))}
      </ul>
    </div>
  )
}

function RewardLine({ reward, meId, today }: { reward: Reward; meId: string; today: string }) {
  const live = rewardPhase(reward, today) === 'live'
  const { data: standings = [] } = useRewardStandings(reward.id, live)
  const mine = live ? myStandingLine(reward, standings, meId) : undefined
  const daysLeft = Math.round((Date.parse(live ? reward.ends_on : reward.starts_on) - Date.parse(today)) / 86_400_000)
  const when = live
    ? daysLeft === 0
      ? 'Ends today'
      : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
    : daysLeft === 1
      ? 'Starts tomorrow'
      : `Starts in ${daysLeft} days`

  return (
    <li className="rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-gray-900">{reward.title}</span>
        <span className="text-xs font-medium text-gray-500">{when}</span>
      </div>
      <div className="text-sm font-bold text-accent">{describePrize(reward)}</div>
      {mine && <div className="mt-0.5 text-sm text-gray-700">{mine}</div>}
    </li>
  )
}
