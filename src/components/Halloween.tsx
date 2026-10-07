import { Ghost } from 'lucide-react'
import { useSeason } from '../lib/season'

// The October look. HalloweenScene replaces the page background (behind the app, and in place of
// the login and dashboard skies); it's aria-hidden and pointer-events-none, so it never gets in the
// way of a click or a screen reader. Its colours are fixed hex: the theme's gray tokens are remapped
// on the dark theme, and the scene picks its own day or night palette instead.

const PALETTES = {
  // Dusk: light enough behind the page that headings and gray text on it stay readable.
  day: {
    sky: 'linear-gradient(180deg, #ece3fb 0%, #f6e6f1 45%, #fde8d4 100%)',
    moon: '#fff8e6',
    moonGlow: 'rgba(255, 236, 200, 0.7)',
    farHill: '#d9c9ea',
    nearHill: '#b9a3d3',
    shapes: '#8f76b0',
    trim: '#715a93',
    stone: '#ab99c7',
    stoneSide: '#8a72ab',
    stoneLine: '#6c5590',
    window: '#fde3b0',
    pumpkin: '#f28c3a',
    pumpkinDark: '#d36a24',
    pumpkinLight: '#fbb46e',
    stem: '#6f7c3c',
    bone: '#f6eedd',
    boneShade: '#bfae93',
    dirt: '#9b83b8',
    dirtDark: '#7c6499',
    face: '#7a4a7e',
    faceGlow: '#7a4a7e',
  },
  night: {
    sky: 'linear-gradient(180deg, #0c0914 0%, #1b1229 50%, #35193a 85%, #4a2236 100%)',
    moon: '#fef3c7',
    moonGlow: 'rgba(254, 243, 199, 0.28)',
    farHill: '#1d1529',
    nearHill: '#110c19',
    shapes: '#0a070f',
    trim: '#2b2338',
    stone: '#3a3149',
    stoneSide: '#221b2c',
    stoneLine: '#110c17',
    window: '#fbbf24',
    pumpkin: '#e8620f',
    pumpkinDark: '#9a3412',
    pumpkinLight: '#fb923c',
    stem: '#3f4a1f',
    bone: '#ddd5c4',
    boneShade: '#7d7465',
    dirt: '#271d31',
    dirtDark: '#3a2d47',
    face: '#fde68a',
    faceGlow: '#fbbf24',
  },
}

// A deterministic scatter, so the sky doesn't reshuffle on every visit. Upper part of the sky only.
const STARS = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 61.8) % 100}%`,
  top: `${((i * 37.3 + (i % 7) * 11) % 100) * 0.55}%`,
  size: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
  delay: (i % 9) * 0.45,
}))

type Palette = (typeof PALETTES)['day']

/**
 * A ribbed pumpkin: shaded lobes, a curved stem, a curly vine and a leaf. `carved` makes it a
 * jack-o'-lantern whose face glows (strongly at night). Sits on the ground at (x, y).
 */
function Pumpkin({ x, y, r, c, carved = false, flip = false }: { x: number; y: number; r: number; c: Palette; carved?: boolean; flip?: boolean }) {
  const h = r * 1.55
  return (
    <g transform={`translate(${x} ${y - h / 2}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx="0" cy={h / 2 + 1} rx={r * 1.3} ry={r * 0.18} fill={c.stoneLine} opacity="0.3" />
      {/* Lobes, back to front: darker at the sides, lighter in the middle. */}
      <ellipse cx={-r * 0.62} cy="0" rx={r * 0.62} ry={h / 2} fill={c.pumpkinDark} />
      <ellipse cx={r * 0.62} cy="0" rx={r * 0.62} ry={h / 2} fill={c.pumpkinDark} />
      <ellipse cx={-r * 0.34} cy="0" rx={r * 0.58} ry={h / 2} fill={c.pumpkin} />
      <ellipse cx={r * 0.34} cy="0" rx={r * 0.58} ry={h / 2} fill={c.pumpkin} />
      <ellipse cx="0" cy="0" rx={r * 0.42} ry={h / 2} fill={c.pumpkinLight} />
      <path
        d={`M${-r * 0.42} ${-h * 0.44}Q${-r * 0.6} 0 ${-r * 0.42} ${h * 0.44}M${r * 0.42} ${-h * 0.44}Q${r * 0.6} 0 ${r * 0.42} ${h * 0.44}M${-r * 0.9} ${-h * 0.36}Q${-r * 1.08} 0 ${-r * 0.9} ${h * 0.36}M${r * 0.9} ${-h * 0.36}Q${r * 1.08} 0 ${r * 0.9} ${h * 0.36}`}
        stroke={c.pumpkinDark}
        strokeWidth={Math.max(0.8, r * 0.07)}
        fill="none"
      />
      <ellipse cx={-r * 0.12} cy={-h * 0.24} rx={r * 0.12} ry={h * 0.16} fill="#ffffff" opacity="0.18" />

      {/* Stem, vine and leaf. */}
      <path
        d={`M${-r * 0.1} ${-h * 0.42}C${-r * 0.12} ${-h * 0.62} ${r * 0.02} ${-h * 0.74} ${r * 0.24} ${-h * 0.8}L${r * 0.3} ${-h * 0.7}C${r * 0.14} ${-h * 0.64} ${r * 0.1} ${-h * 0.54} ${r * 0.12} ${-h * 0.42}Z`}
        fill={c.stem}
      />
      <path
        d={`M${r * 0.08} ${-h * 0.46}c${r * 0.3} ${-h * 0.08} ${r * 0.5} ${h * 0.02} ${r * 0.46} ${-h * 0.14}c${-r * 0.04} ${-h * 0.12} ${-r * 0.24} ${-h * 0.06} ${-r * 0.14} ${h * 0.02}`}
        stroke={c.stem}
        strokeWidth={Math.max(0.7, r * 0.06)}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${-r * 0.12} ${-h * 0.46}C${-r * 0.5} ${-h * 0.62} ${-r * 0.9} ${-h * 0.56} ${-r * 0.98} ${-h * 0.4}C${-r * 0.7} ${-h * 0.36} ${-r * 0.36} ${-h * 0.38} ${-r * 0.12} ${-h * 0.46}Z`}
        fill={c.stem}
      />

      {carved && (
        <g>
          <g fill={c.faceGlow} filter="url(#halloween-glow)" opacity={0.9}>
            <path d={`M${-r * 0.62} ${-h * 0.06}L${-r * 0.36} ${-h * 0.28}L${-r * 0.12} ${-h * 0.06}ZM${r * 0.12} ${-h * 0.06}L${r * 0.36} ${-h * 0.28}L${r * 0.62} ${-h * 0.06}Z`} />
          </g>
          <g fill={c.face}>
            <path d={`M${-r * 0.62} ${-h * 0.06}L${-r * 0.36} ${-h * 0.28}L${-r * 0.12} ${-h * 0.06}ZM${r * 0.12} ${-h * 0.06}L${r * 0.36} ${-h * 0.28}L${r * 0.62} ${-h * 0.06}Z`} />
            <path d={`M-${r * 0.1} ${h * 0.02}L0 ${-h * 0.1}L${r * 0.1} ${h * 0.02}Z`} />
            {/* A jagged grin, two teeth left in. */}
            <path
              d={`M${-r * 0.72} ${h * 0.1}Q0 ${h * 0.46} ${r * 0.72} ${h * 0.1}L${r * 0.5} ${h * 0.2}L${r * 0.4} ${h * 0.12}L${r * 0.28} ${h * 0.24}L${r * 0.04} ${h * 0.24}L${-r * 0.06} ${h * 0.14}L${-r * 0.18} ${h * 0.26}L${-r * 0.4} ${h * 0.2}L${-r * 0.5} ${h * 0.12}Z`}
            />
          </g>
        </g>
      )}
    </g>
  )
}

// Bare trees, grown branch by branch from a seed so they're gnarled but never reshuffle.
type Branch = { d: string; w: number }

function growTree(seed: number, trunkLength: number, trunkWidth: number, depth: number, lean = 0): Branch[] {
  let state = seed
  const random = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const branches: Branch[] = []
  const grow = (x: number, y: number, angle: number, length: number, width: number, level: number) => {
    const bend = (random() - 0.5) * 0.7
    const x2 = x + Math.cos(angle) * length
    const y2 = y + Math.sin(angle) * length
    const cx = x + Math.cos(angle + bend) * length * 0.55
    const cy = y + Math.sin(angle + bend) * length * 0.55
    branches.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, w: width })
    if (level === 0) return
    const count = level > depth - 2 ? 2 : 2 + Math.round(random() * 0.8)
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * (0.5 + random() * 0.5)
      grow(x2, y2, angle + spread + (random() - 0.5) * 0.35, length * (0.6 + random() * 0.22), width * 0.64, level - 1)
    }
  }
  grow(0, 0, -Math.PI / 2 + lean, trunkLength, trunkWidth, depth)
  return branches
}

const TREES = {
  big: growTree(11, 62, 13, 6, -0.08),
  small: growTree(29, 38, 7, 5, 0.12),
  distant: growTree(47, 30, 5, 5, -0.05),
}

/** A bare, gnarled tree with a flared, rooted base and a knot hole. Base at (x, y). */
function BareTree({ x, y, branches, color, knot, size = 1, opacity = 1 }: {
  x: number; y: number; branches: Branch[]; color: string; knot?: string; size?: number; opacity?: number
}) {
  const w = branches[0].w
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} opacity={opacity}>
      <path d={`M${-w * 1.9} 2Q${-w * 0.7} ${-w * 0.3} ${-w * 0.55} ${-w * 3}L${w * 0.55} ${-w * 3}Q${w * 0.7} ${-w * 0.3} ${w * 2.1} 2Z`} fill={color} />
      <path d={`M${-w * 1.2} 0Q${-w * 2.4} 1 ${-w * 3} 4M${w * 1.3} 0Q${w * 2.6} 0 ${w * 3.2} 4`} stroke={color} strokeWidth={w * 0.35} strokeLinecap="round" fill="none" />
      <g stroke={color} strokeLinecap="round" fill="none">
        {branches.map((branch, i) => (
          <path key={i} d={branch.d} strokeWidth={Math.max(0.8, branch.w)} />
        ))}
      </g>
      {knot && <ellipse cx={w * 0.05} cy={-w * 2.6} rx={w * 0.18} ry={w * 0.32} fill={knot} />}
    </g>
  )
}

/** A weathered headstone: rounded top, side depth, carved panel, a crack, on a base slab. Base at (x, y). */
function Gravestone({ x, y, c, tilt = 0, size = 1 }: { x: number; y: number; c: Palette; tilt?: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size})`}>
      <ellipse cx="2" cy="1" rx="26" ry="3.5" fill={c.stoneLine} opacity="0.35" />
      <path d="M17 -2V-34C17 -46 9 -52 0 -52C11 -51.5 21 -45 21.5 -33V-3Z" fill={c.stoneSide} />
      <path d="M-17 -2V-34C-17 -46 -9 -52 0 -52C9 -52 17 -46 17 -34V-2Z" fill={c.stone} />
      <path d="M-11 -9V-32C-11 -40 -6 -44.5 0 -44.5C6 -44.5 11 -40 11 -32V-9" stroke={c.stoneLine} strokeWidth="1.3" fill="none" />
      <text x="0" y="-26" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" fontWeight="700" fill={c.stoneLine}>
        RIP
      </text>
      <path d="M-6 -19H6M-4.5 -14.5H4.5" stroke={c.stoneLine} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M7 -51L4 -45L8 -40L5 -33" stroke={c.stoneLine} strokeWidth="1" fill="none" strokeLinejoin="round" />
      <path d="M-17 -12L-14 -11L-17 -8" fill={c.stoneSide} />
      <rect x="-21" y="-4" width="44" height="6" rx="1" fill={c.stoneSide} />
      <rect x="-21" y="-4" width="40" height="2" rx="1" fill={c.stone} opacity="0.7" />
      <path d="M-24 2l2-6 1 6 2-8 1 8 3-5 0 5M16 2l2-7 1 7 2-5 1 5 2-8 0 8" stroke={c.nearHill} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  )
}

/** A Celtic stone cross with a ring, on a stepped plinth, leaning a little. Base at (x, y). */
function StoneCross({ x, y, c, tilt = 0, size = 1 }: { x: number; y: number; c: Palette; tilt?: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size})`}>
      <ellipse cx="2" cy="1" rx="22" ry="3" fill={c.stoneLine} opacity="0.35" />
      <circle cx="0" cy="-50" r="11" stroke={c.stoneSide} strokeWidth="4.5" fill="none" />
      <circle cx="0" cy="-50" r="11" stroke={c.stone} strokeWidth="2.5" fill="none" />
      <path d="M-4.5 -14V-42H-17.5L-19 -45L-17.5 -48H-4.5V-68L0 -71L4.5 -68V-48H17.5L19 -45L17.5 -42H4.5V-14Z" fill={c.stone} />
      <path d="M4.5 -14V-42H17.5L19 -45L20.5 -43L18.5 -40H6.5V-14ZM4.5 -48V-68L6.5 -66V-48Z" fill={c.stoneSide} />
      <circle cx="0" cy="-45" r="2.2" fill={c.stoneLine} />
      <path d="M-2 -60L1 -55L-1 -51" stroke={c.stoneLine} strokeWidth="0.9" fill="none" />
      <rect x="-10" y="-15" width="21" height="6" fill={c.stoneSide} />
      <rect x="-10" y="-15" width="18" height="6" fill={c.stone} />
      <rect x="-16" y="-9" width="33" height="10" rx="1" fill={c.stoneSide} />
      <rect x="-16" y="-9" width="29" height="10" rx="1" fill={c.stone} />
      <path d="M-19 2l2-6 1 6 2-7 1 7M13 2l2-6 1 6 2-8 1 8" stroke={c.nearHill} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  )
}

// The skeleton hand's bones, as joint-to-joint polylines: forearm, then each finger from the wrist out.
const HAND_FOREARM = [
  [[-3.2, 4], [-4.2, -18]],
  [[3, 4], [2, -18.5]],
]
const HAND_FINGERS = [
  // thumb, index, middle, ring, little: metacarpal, then the phalanges curling forward like a claw
  [[-5, -21.5], [-11, -25.5], [-14.2, -29.5], [-15, -33.5]],
  [[-2.2, -24.5], [-4.2, -34], [-5.2, -40], [-4.2, -44.2], [-1.2, -44.6]],
  [[0, -25], [0, -35.2], [0.2, -42], [1.4, -46.5], [4.4, -46.2]],
  [[2.2, -24.5], [3.6, -34], [5, -40], [6.6, -43.6], [9.4, -42.6]],
  [[3.8, -23.5], [6.6, -31], [9, -35], [10.6, -38.2], [12.6, -37.6]],
]
const CARPALS = [[-4, -20.5], [-1.2, -21.2], [1.8, -20.6], [-2.8, -23.4], [0.6, -23.8], [3.2, -22.6]]

/** A skeleton hand clawing up out of a fresh mound of dirt. Ground level at (x, y). */
function SkeletonHand({ x, y, c, tilt = 0, size = 1 }: { x: number; y: number; c: Palette; tilt?: number; size?: number }) {
  const segments = (points: number[][]) => points.slice(1).map((p, i) => [points[i], p])
  // Bones taper from the knuckles out to the fingertips.
  const fingerWidth = (i: number) => [2, 1.55, 1.35, 1.1][i] ?? 1
  const bone = (from: number[], to: number[], width: number, key: string) => (
    <g key={key}>
      <path d={`M${from[0] + 0.4} ${from[1] + 0.3}L${to[0] + 0.4} ${to[1] + 0.3}`} stroke={c.boneShade} strokeWidth={width + 0.9} strokeLinecap="round" />
      <path d={`M${from[0]} ${from[1]}L${to[0]} ${to[1]}`} stroke={c.bone} strokeWidth={width} strokeLinecap="round" />
    </g>
  )

  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size})`}>
      {HAND_FOREARM.map(([from, to], i) => bone(from, to, 3.2, `arm${i}`))}
      {CARPALS.map(([cx, cy], i) => (
        <g key={`carpal${i}`}>
          <circle cx={cx + 0.3} cy={cy + 0.3} r="2" fill={c.boneShade} />
          <circle cx={cx} cy={cy} r="1.65" fill={c.bone} />
        </g>
      ))}
      {HAND_FINGERS.map((finger, f) =>
        segments(finger).map(([from, to], i) => bone(from, to, fingerWidth(i), `f${f}-${i}`)),
      )}
      {/* Knuckles: a slightly swollen joint between each pair of bones. */}
      {HAND_FINGERS.flatMap((finger, f) =>
        finger.slice(1, -1).map(([jx, jy], i) => (
          <g key={`k${f}-${i}`}>
            <circle cx={jx + 0.3} cy={jy + 0.3} r={fingerWidth(i) * 0.75} fill={c.boneShade} />
            <circle cx={jx} cy={jy} r={fingerWidth(i) * 0.62} fill={c.bone} />
          </g>
        )),
      )}

      {/* The mound it broke through, with a few clods thrown up. */}
      <path d="M-20 4C-14 -3 -7 -5.5 0 -4.5C7 -5.5 14 -3 21 4Z" fill={c.dirt} />
      <path d="M-20 4C-12 0 -4 -1 0 -1C6 -1 13 0 21 4Z" fill={c.dirtDark} />
      <g fill={c.dirtDark}>
        <circle cx="-9" cy="-5" r="1.6" />
        <circle cx="8" cy="-6" r="1.2" />
        <circle cx="13" cy="-2.5" r="1.8" />
        <circle cx="-15" cy="-1.5" r="1.3" />
      </g>
      <g fill={c.dirt}>
        <circle cx="-5" cy="-6.5" r="1.1" />
        <circle cx="4" cy="-5.8" r="1.4" />
      </g>
    </g>
  )
}

/** A paned window: a glowing (or dark, boarded) opening with mullions and shutters. */
function Window({ x, y, w, h, c, lit = true, arched = false, boarded = false }: {
  x: number; y: number; w: number; h: number; c: Palette; lit?: boolean; arched?: boolean; boarded?: boolean
}) {
  const shape = arched
    ? `M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  return (
    <g>
      <path d={shape} fill={lit ? c.window : c.trim} />
      {lit && <path d={shape} fill={c.window} filter="url(#halloween-glow)" opacity="0.8" />}
      <path d={`M${x + w / 2} ${y + 1}V${y + h}M${x} ${y + h * 0.55}H${x + w}`} stroke={c.shapes} strokeWidth="1.6" />
      <rect x={x - 3} y={y + h} width={w + 6} height="2.5" fill={c.trim} />
      {boarded && <path d={`M${x - 2} ${y + 4}L${x + w + 2} ${y + h * 0.4}M${x - 2} ${y + h * 0.75}L${x + w + 2} ${y + h * 0.45}`} stroke={c.shapes} strokeWidth="3" />}
    </g>
  )
}

/** A crooked Victorian house: mansard roof, tower, chimney, porch and an iron fence. Base at (x, y). */
function HauntedHouse({ x, y, c, size = 1 }: { x: number; y: number; c: Palette; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {/* Chimney, a little crooked. */}
      <g transform="rotate(4 94 -128)" fill={c.shapes}>
        <rect x="88" y="-146" width="13" height="34" />
        <rect x="85.5" y="-150" width="18" height="5" />
      </g>

      {/* Left wing. */}
      <rect x="-50" y="-60" width="54" height="60" fill={c.shapes} />
      <path d="M-58 -58L-23 -88L12 -58Z" fill={c.shapes} />
      <path d="M-50 -66H4M-44 -72H-2M-37 -78H-9" stroke={c.trim} strokeWidth="1" />
      <Window x={-36} y={-46} w={18} h={24} c={c} lit={false} boarded />

      {/* Main block and its steep roof. */}
      <rect x="0" y="-92" width="122" height="92" fill={c.shapes} />
      <path d="M-9 -90L61 -144L131 -90Z" fill={c.shapes} />
      <path d="M2 -100H120M17 -112H105M33 -124H89M48 -136H74" stroke={c.trim} strokeWidth="1" />
      <path d="M-9 -90H131" stroke={c.trim} strokeWidth="2.5" />
      <circle cx="61" cy="-112" r="7.5" fill={c.window} />
      <path d="M61 -119.5V-104.5M53.5 -112H68.5" stroke={c.shapes} strokeWidth="1.4" />
      <path d="M8 -46V-88M114 -46V-88" stroke={c.trim} strokeWidth="1" />
      <Window x={17} y={-80} w={20} h={28} c={c} />
      <rect x="10" y="-80" width="6" height="28" fill={c.trim} />
      <Window x={85} y={-80} w={20} h={28} c={c} />
      <rect x="106" y="-74" width="6" height="28" fill={c.trim} transform="rotate(18 106 -74)" />

      {/* Tower with a pointed roof and a finial. */}
      <rect x="122" y="-132" width="46" height="132" fill={c.shapes} />
      <path d="M115 -130L145 -206L175 -130Z" fill={c.shapes} />
      <path d="M121 -140H169M126 -152H164M131 -164H159M136 -176H154" stroke={c.trim} strokeWidth="1" />
      <path d="M145 -206V-222" stroke={c.shapes} strokeWidth="2" />
      <circle cx="145" cy="-224" r="2.5" fill={c.shapes} />
      <path d="M115 -130H175" stroke={c.trim} strokeWidth="2.5" />
      <Window x={135} y={-120} w={20} h={30} c={c} arched />
      <Window x={135} y={-72} w={20} h={30} c={c} arched lit={false} />

      {/* Porch: roof, posts, door and steps. */}
      <path d="M2 -40H120L113 -50H9Z" fill={c.shapes} />
      <path d="M2 -40H120" stroke={c.trim} strokeWidth="1.5" />
      <g fill={c.shapes}>
        {[12, 42, 78, 108].map((px) => (
          <rect key={px} x={px} y="-40" width="4" height="36" />
        ))}
      </g>
      <path d="M52 -4V-30A9 9 0 0 1 70 -30V-4Z" fill={c.window} opacity="0.75" />
      <path d="M61 -36V-4" stroke={c.shapes} strokeWidth="1.2" />
      <path d="M16 -22H50M72 -22H108" stroke={c.trim} strokeWidth="1.2" />
      <rect x="0" y="-5" width="122" height="5" fill={c.shapes} />
      <rect x="47" y="0" width="28" height="3" fill={c.shapes} />
      <rect x="44" y="3" width="34" height="3" fill={c.shapes} />

      {/* Iron fence, spiked, one post leaning. */}
      <g stroke={c.shapes} strokeWidth="1.6">
        <path d="M-70 -4H44M78 -4H200M-70 -12H44M78 -12H200" />
        {Array.from({ length: 22 }, (_, i) => -68 + i * 12)
          .filter((fx) => fx < 40 || fx > 80)
          .map((fx, i) => (
            <path key={fx} d={`M${fx} 4V-18`} transform={i === 15 ? `rotate(8 ${fx} 4)` : undefined} />
          ))}
      </g>
      <g fill={c.shapes}>
        {Array.from({ length: 22 }, (_, i) => -68 + i * 12)
          .filter((fx) => fx < 40 || fx > 80)
          .map((fx, i) => (
            <path key={fx} d={`M${fx - 2.5} -17L${fx} -23L${fx + 2.5} -17Z`} transform={i === 15 ? `rotate(8 ${fx} 4)` : undefined} />
          ))}
      </g>
    </g>
  )
}

/** The whole-page Halloween backdrop. `night` picks the palette; `compact` suits a banner. */
export function HalloweenScene({ night, compact = false }: { night: boolean; compact?: boolean }) {
  const c = night ? PALETTES.night : PALETTES.day

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: c.sky }}>
      {night &&
        STARS.map((star, i) => (
          <span
            key={i}
            className="login-sky-twinkle absolute rounded-full bg-[#ffffff]"
            style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: `${star.delay}s` }}
          />
        ))}

      <div
        className={`absolute rounded-full ${compact ? 'right-[8%] top-[10%] h-14 w-14' : 'right-[9%] top-[9%] h-28 w-28'}`}
        style={{ background: c.moon, boxShadow: `0 0 90px 35px ${c.moonGlow}` }}
      />

      {/* The skyline: far hills, bare trees, a haunted house, graves and pumpkins. Sized by its own aspect
          ratio so the rooftops aren't cropped on a wide screen, capped so it doesn't climb too far up a
          very wide one; a narrow screen crops the sides instead. */}
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="xMidYMax slice"
        className={`absolute inset-x-0 bottom-0 w-full ${compact ? 'h-[55%]' : 'aspect-[1440/320] max-h-[45vh] min-h-48'}`}
      >
        <path d="M0 215C200 175 360 235 560 205S900 165 1100 200 1340 185 1440 195V320H0Z" fill={c.farHill} />

        <defs>
          <filter id="halloween-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={night ? 6 : 3} />
          </filter>
        </defs>

        <BareTree x={40} y={214} branches={TREES.distant} color={c.nearHill} size={1.1} />
        <BareTree x={960} y={194} branches={TREES.distant} color={c.nearHill} size={0.9} opacity={0.9} />

        <HauntedHouse x={1090} y={208} c={c} size={0.82} />

        <path d="M0 262C240 232 420 282 700 257S1150 242 1440 267V320H0Z" fill={c.nearHill} />

        <BareTree x={152} y={270} branches={TREES.big} color={c.shapes} knot={c.trim} />
        <BareTree x={720} y={258} branches={TREES.small} color={c.shapes} knot={c.trim} />

        <Gravestone x={318} y={277} c={c} tilt={-4} />
        <SkeletonHand x={336} y={284} c={c} tilt={-6} size={1.1} />
        <StoneCross x={368} y={275} c={c} tilt={5} />
        <Gravestone x={414} y={272} c={c} tilt={7} size={0.78} />
        <StoneCross x={868} y={266} c={c} tilt={-8} size={0.9} />

        <Pumpkin x={510} y={276} r={17} c={c} carved />
        <Pumpkin x={550} y={278} r={11} c={c} flip />
        <Pumpkin x={1000} y={268} r={14} c={c} carved flip />
        <Pumpkin x={1330} y={282} r={19} c={c} carved />
        <Pumpkin x={1370} y={284} r={10} c={c} />
      </svg>
    </div>
  )
}

/** Next to the light/dark toggle, through October only: switches the Halloween look off and on. */
export function HalloweenToggle() {
  const { inSeason, halloween, toggleHalloween } = useSeason()
  if (!inSeason) return null

  const label = halloween ? 'Turn off Halloween theme' : 'Turn on Halloween theme'
  return (
    <button
      onClick={toggleHalloween}
      aria-label={label}
      title={label}
      aria-pressed={halloween}
      className={`rounded-lg p-2 hover:bg-gray-100 ${halloween ? 'text-accent' : 'text-gray-400 hover:text-gray-700'}`}
    >
      <Ghost className="h-5 w-5" />
    </button>
  )
}
