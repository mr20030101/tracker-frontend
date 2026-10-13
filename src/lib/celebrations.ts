import { useEffect, useState } from 'react'
import { PartyPopper, Target, TrendingUp, type LucideIcon } from 'lucide-react'
import { visibleBadges } from './achievements'
import { burstConfetti } from './confetti'
import type { Achievements } from '../types'

// Moments worth a confetti burst on the dashboard: a badge unlocked, a new personal best, the
// weekly target hit, the day goal reached. Each is celebrated once, remembered in this browser
// (a repeat on another device is harmless). The first time this runs for someone, whatever they've
// already achieved is marked seen without a celebration, so nobody gets a pile of them at once.

export interface Celebration {
  key: string
  icon: LucideIcon
  title: string
  body: string
}

const storageKey = (userId: string) => `celebrated:${userId}`
// Day and week keys pile up; the newest are plenty to remember.
const MAX_REMEMBERED = 200

function readSeen(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function writeSeen(userId: string, seen: Set<string>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...seen].slice(-MAX_REMEMBERED)))
  } catch {
    // Not remembering only means it might be celebrated again.
  }
}

export interface CelebrationInput {
  userId: string
  /** The dashboard's own numbers below have loaded. */
  loaded: boolean
  achievements: Achievements | undefined
  today: string
  weekStart: string
  submittedToday: number
  dayTarget: number
  submittedThisWeek: number
  weeklyTarget: number
}

/** Everything celebratable right now, most special first. */
function candidates(input: CelebrationInput): Celebration[] {
  const { achievements: a } = input
  const list: Celebration[] = []
  if (a) {
    for (const badge of visibleBadges(a)) {
      if (!badge.earned(a)) continue
      list.push({ key: `badge:${badge.id}`, icon: badge.icon, title: `Badge unlocked: ${badge.label}!`, body: `${badge.description} It’s on your profile now. Pin it beside your name!` })
    }
    // The first one is the Personal Best badge itself, above.
    if (a.personal_bests > 1) {
      list.push({ key: `pb:${a.personal_bests}`, icon: TrendingUp, title: 'New personal best!', body: 'This is your biggest week yet. Keep raising the bar!' })
    }
  }
  if (input.weeklyTarget > 0 && input.submittedThisWeek >= input.weeklyTarget) {
    list.push({
      key: `week:${input.weekStart}`,
      icon: Target,
      title: 'Weekly target smashed!',
      body: `That’s ${input.weeklyTarget} this week, and your streak is safe. Every task from here climbs the leaderboard.`,
    })
  }
  if (input.dayTarget > 0 && input.submittedToday >= input.dayTarget) {
    list.push({ key: `day:${input.today}`, icon: PartyPopper, title: 'Day goal reached!', body: 'Nice work today. Anything more is a bonus toward your week.' })
  }
  return list
}

export function useCelebrations(input: CelebrationInput): { current: Celebration | undefined; dismiss: () => void } {
  const [seen, setSeen] = useState<Set<string> | null>(() => readSeen(input.userId))
  const all = candidates(input)

  // First run: take what's already done as seen. Waits for the achievements, or their badges would
  // look new later. (Set during render: the first frame never shows a celebration.)
  if (!seen && input.loaded && input.achievements) {
    const initial = new Set(all.map((c) => c.key))
    writeSeen(input.userId, initial)
    setSeen(initial)
  }

  const current = seen && input.loaded ? all.find((c) => !seen.has(c.key)) : undefined
  const currentKey = current?.key

  useEffect(() => {
    if (currentKey) burstConfetti()
  }, [currentKey])

  return {
    current,
    dismiss: () => {
      if (!current || !seen) return
      const next = new Set(seen).add(current.key)
      writeSeen(input.userId, next)
      setSeen(next)
    },
  }
}
