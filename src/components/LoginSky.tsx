import type { CSSProperties } from 'react'

// Login background: a daytime sky on the light theme and a night sky on the dark one, swapped by
// the same theme classes as the logo (index.css). All motion is CSS (.login-sky-* keyframes),
// which index.css switches off under prefers-reduced-motion.

const OWL_PATH = 'M60 35 L14 13 L14 61 A46 46 0 0 0 106 61 L106 13 Z'

// Fixed spots rather than random ones, so the sky doesn't reshuffle on every visit.
const OWLS = [
  { left: '8%', top: '18%', size: 54, delay: 0, rotate: -12 },
  { left: '84%', top: '12%', size: 40, delay: 1.2, rotate: 10 },
  { left: '14%', top: '72%', size: 36, delay: 2.1, rotate: 8 },
  { left: '78%', top: '68%', size: 62, delay: 0.6, rotate: -8 },
  { left: '48%', top: '88%', size: 30, delay: 1.7, rotate: 14 },
]

const CLOUDS = [
  { top: '10%', width: 180, duration: 70, delay: -10, opacity: 0.9 },
  { top: '30%', width: 120, duration: 55, delay: -40, opacity: 0.7 },
  { top: '58%', width: 220, duration: 90, delay: -60, opacity: 0.8 },
  { top: '80%', width: 140, duration: 65, delay: -25, opacity: 0.6 },
]

// A deterministic scatter of stars (golden-angle spiral, folded into the viewport).
const STARS = Array.from({ length: 48 }, (_, i) => ({
  left: `${(i * 61.8) % 100}%`,
  top: `${(i * 37.3 + (i % 7) * 11) % 100}%`,
  size: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
  delay: (i % 9) * 0.45,
}))

function Owl({ size, eyes, className }: { size: number; eyes: boolean; className: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden="true">
      <path d={OWL_PATH} fill="currentColor" />
      {eyes ? (
        <>
          <circle cx={42} cy={55} r={9} className="login-sky-eye" />
          <circle cx={78} cy={55} r={9} className="login-sky-eye" />
        </>
      ) : (
        <>
          <circle cx={42} cy={55} r={15} fill="#ffffff" fillOpacity={0.7} />
          <circle cx={78} cy={55} r={15} fill="#ffffff" fillOpacity={0.7} />
          <circle cx={42} cy={55} r={7} fill="#f5b301" />
          <circle cx={78} cy={55} r={7} fill="#f5b301" />
        </>
      )}
    </svg>
  )
}

function FloatingOwls({ night }: { night: boolean }) {
  return OWLS.map((owl, i) => (
    <div
      key={i}
      className="login-sky-bob absolute"
      style={{ left: owl.left, top: owl.top, animationDelay: `${owl.delay}s`, '--tilt': `${owl.rotate}deg` } as CSSProperties}
    >
      <Owl size={owl.size} eyes={night} className={night ? 'text-[#0a0e24]' : 'text-[#32373f] opacity-20'} />
    </div>
  ))
}

function DaySky() {
  return (
    <div className="logo-on-light login-sky-day absolute inset-0">
      <div className="login-sky-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#f5b301]/35 blur-3xl" />
      <div
        className="login-sky-blob absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#7dd3fc]/40 blur-3xl"
        style={{ animationDelay: '-6s' }}
      />
      <div
        className="login-sky-blob absolute -bottom-28 left-1/3 h-96 w-96 rounded-full bg-[#f9a8d4]/35 blur-3xl"
        style={{ animationDelay: '-12s' }}
      />
      {CLOUDS.map((cloud, i) => (
        <svg
          key={i}
          viewBox="0 0 200 100"
          width={cloud.width}
          className="login-sky-cloud absolute"
          style={{ top: cloud.top, opacity: cloud.opacity, animationDuration: `${cloud.duration}s`, animationDelay: `${cloud.delay}s` }}
          aria-hidden="true"
        >
          {/* Puffs and a rounded base, all inside the viewBox so nothing is clipped. */}
          <g fill="#ffffff">
            <circle cx={58} cy={62} r={28} />
            <circle cx={100} cy={48} r={38} />
            <circle cx={146} cy={60} r={30} />
            <rect x={22} y={58} width={160} height={36} rx={18} />
          </g>
        </svg>
      ))}
      <FloatingOwls night={false} />
    </div>
  )
}

function NightSky() {
  return (
    <div className="logo-on-dark login-sky-night absolute inset-0">
      {STARS.map((star, i) => (
        <span
          key={i}
          className="login-sky-twinkle absolute rounded-full bg-[#ffffff]"
          style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: `${star.delay}s` }}
        />
      ))}
      {/* Moon with a soft glow. */}
      <div className="absolute right-[10%] top-[8%] h-24 w-24 rounded-full bg-[#fef3c7] shadow-[0_0_80px_30px_rgba(254,243,199,0.25)]">
        <span className="absolute left-5 top-6 h-4 w-4 rounded-full bg-[#fde68a]" />
        <span className="absolute bottom-6 right-6 h-6 w-6 rounded-full bg-[#fde68a]" />
      </div>
      <FloatingOwls night />
    </div>
  )
}

export function LoginSky() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <DaySky />
      <NightSky />
    </div>
  )
}
