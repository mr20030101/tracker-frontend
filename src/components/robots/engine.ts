import type { ReactElement } from 'react'
import { animate, createTimeline, utils, type JSAnimation, type Timeline } from 'animejs'

// Shared machinery for the robot parade (see RobotStage). Every robot is a rig
// of named parts (data-part="armL", "head", ...) and a Performer says how that
// rig moves. A performance is one timeline: fade in, move to the middle, do the
// routine, move off to the right, fade out.

export const STRIDE_MS = 720 // one full walk cycle: both legs
export const BEAT_MS = 480
export const RETURN_MS = 400 // every routine settles back to its rest pose in this time
export const ACT_MS = 8 * BEAT_MS
export const PX_PER_STRIDE = 64
export const EDGE_PAD = 16
export const ROBOT_OPACITY = 0.3
export const HOVER = -14 // how far (user units) a hovering robot floats above the ground
const FADE_MS = 350

export type Step = [to: number, ms: number, ease?: string]
export type Parts = Record<string, HTMLElement>

export interface Performer {
  id: string
  /** The robot's artwork, split into parts. */
  Rig: () => ReactElement
  /** Gets the robot from `from` to `to` (px), in `strides` walk cycles. Returns when it arrives. */
  move: Move
  /** The routine, starting at `at`. Returns when it ends. */
  act: (tl: Timeline, p: Parts, at: number) => number
  /** Puts parts in their starting pose when it isn't the drawn one. */
  init?: (p: Parts) => void
  /** Loops that run for the whole performance, on parts the timeline doesn't animate. */
  ambient?: (p: Parts) => JSAnimation[]
}

export type Move = (tl: Timeline, p: Parts, at: number, from: number, to: number, strides: number) => number

// Keyframes that begin from a known value: every block starts from a pose we
// know exactly, so nothing has to be read back from the element.
export const track = (from: number, steps: Step[]) =>
  steps.map(([to, duration, ease], i) => ({ ...(i === 0 ? { from } : {}), to, duration, ...(ease ? { ease } : {}) }))

/** `n` alternating keyframes either side of `center`. */
export const osc = (center: number, amp: number, n: number, ms: number, ease?: string): Step[] =>
  Array.from({ length: n }, (_, i): Step => [center + (i % 2 === 0 ? amp : -amp), ms, ease])

/** `steps` repeated `times` times. */
export const repeat = (times: number, steps: Step[]): Step[] => Array.from({ length: times }, () => steps).flat()

const total = (steps: Step[]) => steps.reduce((sum, [, ms]) => sum + ms, 0)

/**
 * Pads `moves` to fill the routine, then returns to `rest`. Throws if the moves
 * are too long, so a track that runs over (and would drift out of step with the
 * others) is caught the first time it plays instead of looking subtly wrong.
 */
export function closing(moves: Step[], rest: number): Step[] {
  const budget = ACT_MS - RETURN_MS
  const used = total(moves)
  if (used > budget + 0.5) throw new Error(`A routine track runs ${used}ms; it only has ${budget}ms before the settle.`)
  const last = moves.length ? moves[moves.length - 1][0] : rest
  return [...moves, ...(used < budget ? [[last, budget - used] as Step] : []), [rest, RETURN_MS]]
}

/** One property of one part, over the whole routine. */
export function put(tl: Timeline, el: HTMLElement, prop: string, from: number, moves: Step[], at: number, rest = from) {
  tl.add(el, { [prop]: track(from, closing(moves, rest)) }, at)
}

/** A loop of `cycle` ms that fits a whole number of times into `duration`, so it ends when the movement does. */
function cycles(duration: number, target: number) {
  const n = Math.max(1, Math.round(duration / target))
  return { n, cycle: duration / n }
}

export const wobble = (el: HTMLElement, amp: number, ms = 520) =>
  animate(el, { rotate: [{ from: -amp, to: amp }], duration: ms, ease: 'inOutSine', alternate: true, loop: true })

export const joint = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' as const })

export interface Gait {
  stride: number // ms per full cycle
  legs: number // how far the lifted foot kicks out, degrees
  lift: number // how high it lifts, user units
  armL: [rest: number, swing: number]
  armR: [rest: number, swing: number]
  sway: number // torso sway, degrees
  head: number // head counter-tilt, degrees
  hop: number // bounce on each step, user units
}

/**
 * Marches: one foot lifts and kicks out slightly while the other stays planted,
 * then they swap. Arms swing, the torso sways over the planted foot, and it
 * bounces a little on each step.
 */
export const walker =
  (g: Gait): Move =>
  (tl, p, at, from, to, strides) => {
    const S = g.stride
    const loop = strides - 1
    const swing = (rest: number, amount: number) =>
      track(rest, [[rest + amount, S / 4, 'outSine'], [rest - amount, S / 2], [rest, S / 4, 'inSine']])
    tl.add(p.root, { translateX: [from, to], duration: strides * S, ease: 'linear' }, at)
    // One foot's turn: up and back down over half a stride, then planted for the other half.
    // legL goes in the first half of the stride, legR in the second.
    const foot = (peak: number, second: boolean): Step[] => {
      const up: Step[] = [[peak, S / 4, 'outSine'], [0, S / 4, 'inSine']]
      const planted: Step = [0, S / 2]
      return second ? [planted, ...up] : [...up, planted]
    }
    if (p.legL) {
      tl.add(p.legL, { rotate: track(0, foot(g.legs, false)), loop }, at)
      tl.add(p.legL, { translateY: track(0, foot(-g.lift, false)), loop }, at)
    }
    if (p.legR) {
      tl.add(p.legR, { rotate: track(0, foot(-g.legs, true)), loop }, at)
      tl.add(p.legR, { translateY: track(0, foot(-g.lift, true)), loop }, at)
    }
    if (p.armL) tl.add(p.armL, { rotate: swing(...g.armL), loop }, at)
    if (p.armR) tl.add(p.armR, { rotate: swing(...g.armR), loop }, at)
    if (p.sway) tl.add(p.sway, { rotate: swing(0, g.sway), loop }, at)
    if (p.head) tl.add(p.head, { rotate: swing(0, -g.head), loop }, at)
    if (p.bob) {
      const hop: Step[] = [[-g.hop, S / 4, 'outSine'], [0, S / 4, 'inSine'], [-g.hop, S / 4, 'outSine'], [0, S / 4, 'inSine']]
      tl.add(p.bob, { translateY: track(0, hop), loop }, at)
    }
    return at + strides * S
  }

/** Glides on its base: leans into the motion and rattles a little. */
export const roller: Move = (tl, p, at, from, to, strides) => {
  const duration = strides * STRIDE_MS
  const rattle = cycles(duration, 100)
  tl.add(p.root, { translateX: [from, to], duration, ease: 'linear' }, at)
  tl.add(p.sway, { rotate: track(0, [[4, 400, 'outSine'], [4, duration - 800], [0, 400, 'inSine']]) }, at)
  tl.add(p.bob, { translateY: track(0, [[-0.8, rattle.cycle / 2], [0, rattle.cycle / 2]]), loop: rattle.n - 1 }, at)
  return at + duration
}

/** Floats along on its thruster: bobs, leans forward and flickers the flame. */
export const hoverer: Move = (tl, p, at, from, to, strides) => {
  const duration = strides * STRIDE_MS
  const float = cycles(duration, 1400)
  const flicker = cycles(duration, 200)
  tl.add(p.root, { translateX: [from, to], duration, ease: 'linear' }, at)
  tl.add(p.tilt, { rotate: track(0, [[8, 400, 'outSine'], [8, duration - 800], [0, 400, 'inSine']]) }, at)
  tl.add(p.bob, { translateY: track(HOVER, [[HOVER - 6, float.cycle / 2], [HOVER, float.cycle / 2]]), loop: float.n - 1 }, at)
  tl.add(p.flame, { scaleY: track(1, [[1.3, flicker.cycle / 2], [1, flicker.cycle / 2]]), loop: flicker.n - 1 }, at)
  return at + duration
}

export function collectParts(root: HTMLElement): Parts {
  const parts: Parts = { root }
  root.querySelectorAll<HTMLElement>('[data-part]').forEach((el) => {
    parts[el.dataset.part as string] = el
  })
  return parts
}

/** The whole show for one robot: `distance` px of stage, in from the left, routine in the middle, out to the right. */
export function buildPerformance(cast: Performer, p: Parts, distance: number, onComplete: () => void): Timeline {
  const half = distance / 2
  const strides = Math.max(2, Math.round(half / PX_PER_STRIDE))
  cast.init?.(p)
  utils.set(p.root, { translateX: 0, opacity: 0 })
  const tl = createTimeline({ defaults: { ease: 'inOutSine' }, onComplete })
  tl.add(p.root, { opacity: [0, ROBOT_OPACITY], duration: FADE_MS, ease: 'linear' }, 0)
  let at = cast.move(tl, p, 0, 0, half, strides)
  at = cast.act(tl, p, at)
  at = cast.move(tl, p, at, half, distance, strides)
  tl.add(p.root, { opacity: [ROBOT_OPACITY, 0], duration: FADE_MS, ease: 'linear' }, at - FADE_MS)
  return tl
}
