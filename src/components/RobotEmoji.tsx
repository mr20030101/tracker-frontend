import { useEffect, useRef } from 'react'
import { animate, utils, type JSAnimation } from 'animejs'
import { useReducedMotion } from '../lib/motion'

// A small robot that lives next to a page title and, every few seconds, does one of a handful of
// little routines: a hop, a dance, a spin, or a short walk. Every routine ends back at rest.

// One robot per page title, so no two pages share one. Swap any of them here.
export const ROBOTS = {
  dashboard: '🤖',
  leaderboard: '🦾',
  taskLog: '👾',
  requests: '🛸',
  resources: '🛰️',
  users: '🦿',
  projects: '🚀',
  hiring: '👽',
  dataQuality: '📡',
  activityLog: '🕹️',
  team: '🎮',
  profile: '🔌',
  apply: '⚙️',
} as const

export type RobotPage = keyof typeof ROBOTS

const kf = (to: number, duration: number, ease = 'inOutSine') => ({ to, duration, ease })
const alternate = (amp: number, n: number, ms: number) =>
  Array.from({ length: n }, (_, i) => kf(i % 2 === 0 ? amp : -amp, ms))

const ROUTINES: ((el: HTMLElement) => JSAnimation)[] = [
  // Hop, hop.
  (el) =>
    animate(el, {
      translateY: [{ from: 0, to: -12, duration: 150, ease: 'outQuad' }, kf(0, 150, 'inQuad'), kf(-12, 150, 'outQuad'), kf(0, 150, 'inQuad')],
    }),
  // Dance: a wiggle with a bounce on every beat.
  (el) =>
    animate(el, {
      rotate: [{ from: 0, to: -16, duration: 120 }, ...alternate(16, 6, 120).map((k, i) => (i === 0 ? { ...k, to: 16 } : k)), kf(0, 120)],
      translateY: [{ from: 0, to: -4, duration: 120 }, kf(0, 120), kf(-4, 120), kf(0, 120), kf(-4, 120), kf(0, 120), kf(-4, 120), kf(0, 120)],
    }),
  // Spin, in the air.
  (el) =>
    animate(el, {
      rotate: [{ from: 0, to: 360, duration: 700, ease: 'inOutSine' }],
      translateY: [{ from: 0, to: -14, duration: 350, ease: 'outQuad' }, kf(0, 350, 'inQuad')],
    }),
  // A short walk there and back: sways with each step and bobs.
  (el) =>
    animate(el, {
      translateX: [{ from: 0, to: 14, duration: 700, ease: 'linear' }, kf(-14, 1400, 'linear'), kf(0, 700, 'linear')],
      rotate: [{ from: 0, to: 6, duration: 175 }, ...alternate(-6, 15, 175).map((k, i) => (i === 0 ? { ...k, to: -6 } : k)), kf(0, 175)],
      translateY: [{ from: 0, to: -3, duration: 175 }, ...Array.from({ length: 15 }, (_, i) => kf(i % 2 === 0 ? 0 : -3, 175)), kf(0, 175)],
    }),
]

export function RobotEmoji({ page, className = '' }: { page: RobotPage; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion) return
    let timer = 0
    let running: JSAnimation | null = null
    let last = -1

    function schedule(ms: number) {
      timer = window.setTimeout(perform, ms)
    }
    function perform() {
      // A different routine each time.
      let next = Math.floor(Math.random() * ROUTINES.length)
      if (next === last) next = (next + 1) % ROUTINES.length
      last = next
      running = ROUTINES[next](el!)
      running.then(() => {
        utils.set(el!, { translateX: 0, translateY: 0, rotate: 0 })
        schedule(4000 + Math.random() * 5000)
      })
    }
    schedule(1500 + Math.random() * 1500)

    return () => {
      window.clearTimeout(timer)
      running?.revert()
    }
  }, [reducedMotion])

  return (
    <span ref={ref} aria-hidden="true" className={`inline-block select-none ${className}`}>
      {ROBOTS[page]}
    </span>
  )
}
