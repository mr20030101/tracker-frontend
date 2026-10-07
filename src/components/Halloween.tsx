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
    window: '#fde3b0',
    pumpkin: '#f28c3a',
    face: '#8f76b0',
  },
  night: {
    sky: 'linear-gradient(180deg, #0c0914 0%, #1b1229 50%, #35193a 85%, #4a2236 100%)',
    moon: '#fef3c7',
    moonGlow: 'rgba(254, 243, 199, 0.28)',
    farHill: '#1d1529',
    nearHill: '#110c19',
    shapes: '#0a070f',
    window: '#fbbf24',
    pumpkin: '#ea580c',
    face: '#fcd34d',
  },
}

// A deterministic scatter, so the sky doesn't reshuffle on every visit. Upper part of the sky only.
const STARS = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 61.8) % 100}%`,
  top: `${((i * 37.3 + (i % 7) * 11) % 100) * 0.55}%`,
  size: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
  delay: (i % 9) * 0.45,
}))

function Pumpkin({ x, y, r, fill, face }: { x: number; y: number; r: number; fill: string; face: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-r * 0.12} y={-r * 1.25} width={r * 0.24} height={r * 0.45} rx={r * 0.1} fill="#4d5b2a" />
      <ellipse cx={-r * 0.38} cy={0} rx={r * 0.72} ry={r * 0.9} fill={fill} />
      <ellipse cx={r * 0.38} cy={0} rx={r * 0.72} ry={r * 0.9} fill={fill} />
      <ellipse cx={0} cy={0} rx={r * 0.62} ry={r * 0.95} fill={fill} />
      <path
        d={`M${-r * 0.5} ${-r * 0.15} l${r * 0.2} ${-r * 0.28} l${r * 0.2} ${r * 0.28}Z M${r * 0.1} ${-r * 0.15} l${r * 0.2} ${-r * 0.28} l${r * 0.2} ${r * 0.28}Z M${-r * 0.55} ${r * 0.25} q${r * 0.55} ${r * 0.45} ${r * 1.1} 0 q${-r * 0.55} ${r * 0.18} ${-r * 1.1} 0Z`}
        fill={face}
      />
    </g>
  )
}

function Tombstone({ x, y, fill, cross = false }: { x: number; y: number; fill: string; cross?: boolean }) {
  return cross ? (
    <path d={`M${x + 8} ${y} v-34 h-11 v-9 h11 v-11 h9 v11 h11 v9 h-11 v34Z`} fill={fill} />
  ) : (
    <path d={`M${x} ${y} v-30 a15 15 0 0 1 30 0 v30Z`} fill={fill} />
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

      {/* The skyline: far hills, then a crooked tree, tombstones, a haunted house and pumpkins. */}
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="xMidYMax slice"
        className={`absolute inset-x-0 bottom-0 w-full ${compact ? 'h-[55%]' : 'h-[38vh] min-h-48'}`}
      >
        <path d="M0 215C200 175 360 235 560 205S900 165 1100 200 1340 185 1440 195V320H0Z" fill={c.farHill} />

        {/* Haunted house on the far hill. */}
        <g fill={c.shapes}>
          <rect x="1150" y="128" width="130" height="80" />
          <path d="M1138 132 1215 82 1292 132Z" />
          <rect x="1252" y="70" width="34" height="80" />
          <path d="M1246 74 1269 22 1292 74Z" />
          <rect x="1176" y="96" width="10" height="26" />
        </g>
        <g fill={c.window}>
          <rect x="1166" y="146" width="16" height="20" rx="2" />
          <rect x="1204" y="146" width="16" height="20" rx="2" />
          <rect x="1262" y="92" width="14" height="18" rx="7" />
          <rect x="1236" y="168" width="20" height="40" rx="10" opacity="0.8" />
        </g>

        <path d="M0 262C240 232 420 282 700 257S1150 242 1440 267V320H0Z" fill={c.nearHill} />

        {/* Crooked tree. */}
        <g stroke={c.shapes} strokeLinecap="round" fill="none">
          <path d="M150 268C156 222 146 186 160 140" strokeWidth="14" />
          <path d="M160 140C140 118 116 116 92 98" strokeWidth="7" />
          <path d="M160 140C172 110 196 100 214 74" strokeWidth="7" />
          <path d="M156 186C182 176 206 178 230 160" strokeWidth="6" />
          <path d="M92 98C84 86 86 74 78 64M214 74C224 66 236 66 244 56M230 160C240 150 254 150 262 140" strokeWidth="3.5" />
          <path d="M158 140C158 112 150 94 154 66" strokeWidth="4.5" />
        </g>

        <g>
          <Tombstone x={300} y={272} fill={c.shapes} />
          <Tombstone x={348} y={270} fill={c.shapes} cross />
          <Tombstone x={392} y={268} fill={c.shapes} />
          <Tombstone x={850} y={262} fill={c.shapes} cross />
        </g>

        <Pumpkin x={510} y={268} r={16} fill={c.pumpkin} face={c.face} />
        <Pumpkin x={548} y={272} r={11} fill={c.pumpkin} face={c.face} />
        <Pumpkin x={990} y={262} r={14} fill={c.pumpkin} face={c.face} />
        <Pumpkin x={1340} y={274} r={18} fill={c.pumpkin} face={c.face} />
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
