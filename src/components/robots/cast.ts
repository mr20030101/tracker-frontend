import { utils, type Timeline } from 'animejs'
import {
  ACT_MS,
  BEAT_MS,
  HOVER,
  STRIDE_MS,
  hoverer,
  osc,
  put,
  repeat,
  roller,
  track,
  walker,
  wobble,
  type Parts,
  type Performer,
  type Step,
} from './engine'
import { BoxbotRig, BruteRig, CanisterRig, ClassicRig, CyclopsRig, HeartbotRig, RocketRig } from './rigs'

// The parade, in the order they take the stage. Arm angles are rotations about
// the shoulder, in degrees clockwise: 0 is the arm as drawn, and each robot's
// numbers below are worked out from where its hands are drawn.

const B = BEAT_MS
const q = B / 2

// ---------------------------------------------------------------------------
// robot.svg: the original. It hangs its right arm down to walk and raises it
// (as drawn, at 0) to dance.
const CLASSIC_ARM_DOWN = 108
const CLASSIC_ARM_L_UP = 121

// Hands up, alternating arm pumps with kicks, a shimmy, then a jump-spin. Every
// track adds up to the same length, so the parts stay in step.
function classicDance(tl: Timeline, p: Parts, at: number) {
  const shimmy = B / 4
  const settle = 400
  const spinAt = B + 4 * B + 2 * B
  const add = (part: string, prop: string, from: number, steps: Step[]) => tl.add(p[part], { [prop]: track(from, steps) }, at)

  add('armL', 'rotate', 0, [
    [CLASSIC_ARM_L_UP, B, 'outBack'],
    [70, B], [CLASSIC_ARM_L_UP, B], [70, B], [CLASSIC_ARM_L_UP, B],
    [61, q], [68, shimmy], [54, shimmy], [68, shimmy], [54, shimmy], [61, q],
    [CLASSIC_ARM_L_UP, q, 'outBack'], [CLASSIC_ARM_L_UP, q],
    [0, settle],
  ])
  add('armR', 'rotate', CLASSIC_ARM_DOWN, [
    [0, B, 'outBack'],
    [0, B], [45, B], [0, B], [45, B],
    [54, q], [47, shimmy], [61, shimmy], [47, shimmy], [61, shimmy], [54, q],
    [0, q, 'outBack'], [0, q],
    [CLASSIC_ARM_DOWN, settle],
  ])
  add('legL', 'rotate', 0, [[0, B], [28, q, 'outSine'], [0, q], [0, B], [28, q, 'outSine'], [0, q], [0, B], [0, 2 * B], [0, B], [0, settle]])
  add('legR', 'rotate', 0, [[0, B], [0, B], [-28, q, 'outSine'], [0, q], [0, B], [-28, q, 'outSine'], [0, q], [0, 2 * B], [0, B], [0, settle]])
  add('sway', 'rotate', 0, [
    [-4, B], [8, B], [-8, B], [8, B], [-8, B],
    ...osc(0, 5, 8, shimmy),
    [0, B], [0, settle],
  ])
  add('head', 'rotate', 0, [
    [-8, B], [-10, B], [10, B], [-10, B], [10, B],
    ...osc(0, 4, 8, shimmy),
    [0, B], [0, settle],
  ])
  // Squat on the first beat, bounce on the rest, then a jump for the spin.
  add('bob', 'translateY', 0, [
    [8, q], [0, q],
    ...repeat(4, [[8, q], [-2, q]]),
    ...osc(0, 4, 8, shimmy),
    [10, B / 4, 'outSine'], [-46, (3 * B) / 8, 'outQuad'], [0, (3 * B) / 8, 'inQuad'],
    [0, settle],
  ])
  add('pupils', 'translateX', 0, [[-6, B], [6, 2 * B], [-6, 2 * B], [6, q], [-6, q], [6, q], [-6, q], [0, B], [0, settle]])
  // The spin: the robot turns away and back while it is in the air.
  tl.add(p.flip, { scaleX: track(1, [[-1, q, 'inOutSine'], [1, q, 'inOutSine']]) }, at + spinAt)
  return at + B + 4 * B + 2 * B + B + settle
}

const classic: Performer = {
  id: 'classic',
  Rig: ClassicRig,
  move: walker({ stride: STRIDE_MS, legs: 14, lift: 10, armL: [0, -18], armR: [CLASSIC_ARM_DOWN, 18], sway: 3, head: 2, hop: 5 }),
  init: (p) => utils.set(p.armR, { rotate: CLASSIC_ARM_DOWN }),
  act: classicDance,
  ambient: (p) => [wobble(p.antenna, 7)],
}

// ---------------------------------------------------------------------------
// Set robot 1, the cyclops: curious. Its eye darts about, its head tilts, it
// waves, then throws both arms up and hops.
const cyclops: Performer = {
  id: 'cyclops',
  Rig: CyclopsRig,
  move: walker({ stride: STRIDE_MS, legs: 12, lift: 5, armL: [0, -16], armR: [0, 16], sway: 3, head: 2, hop: 2.5 }),
  ambient: (p) => [wobble(p.antenna, 8)],
  act(tl, p, at) {
    put(tl, p.pupils, 'translateX', 0, [[-7, B], [7, B], [-7, q], [7, q], [-7, q], [7, q], [0, q]], at)
    put(tl, p.pupils, 'translateY', 0, [[-6, 2 * B], [0, B], [5, q], [0, q]], at)
    put(tl, p.head, 'rotate', 0, [[-10, B], [10, B], [-8, B], [0, B], [8, B], [0, B]], at)
    put(tl, p.armR, 'rotate', 0, [[-132, B, 'outBack'], ...osc(-132, 18, 6, q)], at)
    put(tl, p.armL, 'rotate', 0, [[0, 4 * B], [132, B, 'outBack']], at)
    put(tl, p.bob, 'translateY', 0, [[0, 5 * B], ...repeat(2, [[-8, q, 'outQuad'], [0, q, 'inQuad']])], at)
    return at + ACT_MS
  },
}

// ---------------------------------------------------------------------------
// Set robot 2, the box bot: no legs, so it rolls in on its tread. Stiff robot
// dance: it snaps between poses on every beat.
const snap = (values: number[]): Step[] => values.flatMap((v): Step[] => [[v, 120, 'outQuad'], [v, B - 120]])

const boxbot: Performer = {
  id: 'boxbot',
  Rig: BoxbotRig,
  move: roller,
  act(tl, p, at) {
    put(tl, p.armL, 'rotate', 0, snap([80, 150, 80, 150, 0, 150, 80]), at)
    put(tl, p.armR, 'rotate', 0, snap([-80, -80, -150, -150, -150, 0, -80]), at)
    put(tl, p.head, 'rotate', 0, snap([-18, 18, -18, 18, -18, 18, -18]), at)
    put(tl, p.sway, 'rotate', 0, osc(0, 4, 14, q), at)
    put(tl, p.bob, 'translateY', 0, repeat(7, [[-3, 120, 'outQuad'], [0, B - 120]]), at)
    put(tl, p.antL, 'rotate', 0, osc(0, 22, 14, q), at)
    put(tl, p.antR, 'rotate', 0, osc(0, -22, 14, q), at)
    put(tl, p.base, 'scaleX', 1, repeat(7, [[1.07, 120, 'outQuad'], [1, B - 120]]), at)
    return at + ACT_MS
  },
}

// ---------------------------------------------------------------------------
// Set robot 3, the bean: floats along on its thruster. It boosts up, loops the
// loop with the flame roaring, waves, and drifts back down.
const rocket: Performer = {
  id: 'rocket',
  Rig: RocketRig,
  move: hoverer,
  init: (p) => utils.set(p.bob, { translateY: HOVER }),
  ambient: (p) => [wobble(p.antenna, 8, 640)],
  act(tl, p, at) {
    put(tl, p.bob, 'translateY', HOVER, [[-40, 3 * q, 'outQuad'], [-40, 6 * q], [HOVER, 3 * q, 'inQuad']], at)
    // A full turn about its middle; -360 looks the same as 0, so it stays there.
    put(tl, p.tilt, 'rotate', 0, [[0, 3 * q], [-360, 6 * q, 'inOutSine']], at, -360)
    put(tl, p.flame, 'scaleY', 1, osc(1.8, 0.35, 12, q), at, 1)
    put(tl, p.armL, 'rotate', 0, osc(0, 25, 12, q), at)
    put(tl, p.armR, 'rotate', 0, [[-114, B, 'outBack']], at)
    put(tl, p.eyes, 'scaleY', 1, [[1, 5 * q], [0.1, 90], [1, 90], [1, 900], [0.1, 90], [1, 90]], at)
    return at + ACT_MS
  },
}

// ---------------------------------------------------------------------------
// Set robot 4, the heart: friendly. It waves with both hands while its heart beats.
const heartbot: Performer = {
  id: 'heartbot',
  Rig: HeartbotRig,
  // Its right arm is drawn raised, so the swing is a wave.
  move: walker({ stride: STRIDE_MS, legs: 12, lift: 5, armL: [0, -16], armR: [0, 14], sway: 3, head: 2, hop: 2.5 }),
  act(tl, p, at) {
    put(tl, p.armR, 'rotate', 0, osc(0, 24, 14, q), at)
    // The left hand comes up beside the head and waves too, leaving the heart clear.
    put(tl, p.armL, 'rotate', 0, [[98, B, 'outBack'], ...osc(98, -20, 12, q)], at)
    put(tl, p.chest, 'scale', 1, repeat(7, [[1.09, 120, 'outQuad'], [1, 120], [1.09, 120], [1, 120]]), at)
    put(tl, p.head, 'rotate', 0, osc(0, 10, 7, B), at)
    put(tl, p.bob, 'translateY', 0, repeat(3, [[-6, q, 'outQuad'], [0, q, 'inQuad'], [0, B]]), at)
    put(tl, p.eyes, 'scaleY', 1, [[1, 5 * B / 2], [0.1, 90], [1, 90], [1, 800], [0.1, 90], [1, 90]], at)
    put(tl, p.legL, 'rotate', 0, repeat(3, [[12, q], [0, q], [0, B]]), at)
    put(tl, p.legR, 'rotate', 0, repeat(3, [[0, B], [-12, q], [0, q]]), at)
    return at + ACT_MS
  },
}

// ---------------------------------------------------------------------------
// Set robot 5, the canister: waddles. Rocks from side to side, flaps its arms,
// rolls its eyes, and spins round at the end.
const canister: Performer = {
  id: 'canister',
  Rig: CanisterRig,
  move: walker({ stride: STRIDE_MS, legs: 10, lift: 4, armL: [0, -12], armR: [0, 12], sway: 8, head: 0, hop: 2 }),
  ambient: (p) => [wobble(p.antenna, 6, 600)],
  act(tl, p, at) {
    put(tl, p.sway, 'rotate', 0, osc(0, 10, 12, q), at)
    put(tl, p.bob, 'translateY', 0, repeat(6, [[-4, q, 'outSine'], [0, q, 'inSine']]), at)
    put(tl, p.legL, 'rotate', 0, osc(0, 16, 12, q), at)
    put(tl, p.legR, 'rotate', 0, osc(0, -16, 12, q), at)
    put(tl, p.armL, 'rotate', 0, [[114, B, 'outBack'], ...osc(114, 22, 8, 180)], at)
    put(tl, p.armR, 'rotate', 0, [[-114, B, 'outBack'], ...osc(-114, -22, 8, 180)], at)
    put(tl, p.eyes, 'translateX', 0, repeat(3, [[-4, q], [0, q], [4, q], [0, q]]), at)
    put(tl, p.eyes, 'translateY', 0, repeat(3, [[0, q], [-4, q], [0, q], [4, q]]), at)
    put(tl, p.spin, 'scaleX', 1, [[1, 5 * B], [-1, 360, 'inOutSine'], [1, 360, 'inOutSine']], at)
    return at + ACT_MS
  },
}

// ---------------------------------------------------------------------------
// Set robot 6, the heavy one: stomps, then flexes with its core glowing.
const stomp = (lead: Step[], follow: Step[]) => repeat(2, [...lead, ...follow])
const brute: Performer = {
  id: 'brute',
  Rig: BruteRig,
  move: walker({ stride: 900, legs: 10, lift: 7, armL: [0, -10], armR: [0, 10], sway: 2, head: 2, hop: 2 }),
  act(tl, p, at) {
    // One foot at a time: lift, slam, and the whole body drops as it lands.
    put(tl, p.legL, 'rotate', 0, stomp([[16, q, 'outSine'], [0, 120, 'inQuad']], [[0, 600]]), at)
    put(tl, p.legR, 'rotate', 0, stomp([[0, B]], [[-16, q, 'outSine'], [0, 120, 'inQuad'], [0, 120]]), at)
    put(tl, p.bob, 'translateY', 0, repeat(2, [[0, 360], [5, 60, 'inQuad'], [0, 180, 'outQuad'], [0, 240], [5, 60, 'inQuad'], [0, 60]]), at)
    put(tl, p.armL, 'rotate', 0, [[0, 4 * B], [150, B, 'outBack'], ...osc(150, 22, 4, q)], at)
    put(tl, p.armR, 'rotate', 0, [[0, 4 * B], [-150, B, 'outBack'], ...osc(-150, -22, 4, q)], at)
    put(tl, p.core, 'scale', 1, repeat(7, [[1.9, q, 'outQuad'], [1, q, 'inQuad']]), at)
    put(tl, p.head, 'rotate', 0, osc(0, 8, 7, B), at)
    put(tl, p.sway, 'rotate', 0, osc(0, 2, 14, q), at)
    return at + ACT_MS
  },
}

export const CAST: Performer[] = [classic, cyclops, boxbot, rocket, heartbot, canister, brute]
