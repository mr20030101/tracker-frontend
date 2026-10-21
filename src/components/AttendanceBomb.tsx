import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { ATTENDANCE_OPENS_MIN, attendanceTimeLabel } from '../lib/attendance'
import { playBombSound, prepareBombSound, type BombSound } from '../lib/bombSound'
import { sgMinutesSinceMidnight } from '../lib/week'
import { useNow } from '../lib/useNow'

// The contributor's "you haven't filed attendance yet" countdown: a bomb whose fuse burns down to
// the closing time, beeping like a time bomb in the last five minutes.

const MUTED_KEY = 'attendance-bomb-muted'

type Stage = 'calm' | 'warning' | 'critical' | 'final'

function stageFor(secondsLeft: number): Stage {
  if (secondsLeft <= 60) return 'final'
  if (secondsLeft <= 15 * 60) return 'critical'
  if (secondsLeft <= 60 * 60) return 'warning'
  return 'calm'
}

// Silent until the last few minutes, then a beep each second, doubling in the last minute.
const SOUND_FROM_SECONDS = 5 * 60

function soundFor(secondsLeft: number): BombSound | null {
  if (secondsLeft <= 0 || secondsLeft > SOUND_FROM_SECONDS) return null
  return secondsLeft <= 60 ? 'double-beep' : 'beep'
}

const STAGE_TEXT: Record<Stage, string> = {
  calm: "You haven't filed today's attendance yet.",
  warning: 'Less than an hour left to file your attendance!',
  critical: 'Hurry! Your attendance is about to close!',
  final: 'Last seconds! File your attendance NOW!',
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, secondsLeft)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** Seconds from `now` until attendance closes at `closesMin` (minutes after midnight, Singapore time). */
export function secondsUntilClose(now: Date, closesMin: number): number {
  return (closesMin - sgMinutesSinceMidnight(now)) * 60 - now.getUTCSeconds()
}

export function AttendanceBomb({ closesMin, silent = false, onFile }: { closesMin: number; silent?: boolean; onFile: () => void }) {
  const now = useNow(1000)
  const [muted, setMuted] = useState(readMuted)
  const secondsLeft = secondsUntilClose(new Date(now), closesMin)
  const stage = stageFor(secondsLeft)
  // How much of the fuse is left: all of it at opening time, none at closing.
  const fuse = Math.min(1, Math.max(0, secondsLeft / ((closesMin - ATTENDANCE_OPENS_MIN) * 60)))

  useEffect(prepareBombSound, [])

  useEffect(() => {
    const sound = soundFor(secondsLeft)
    if (sound && !muted && !silent) playBombSound(sound)
  }, [secondsLeft, muted, silent])

  function toggleMuted() {
    const next = !muted
    setMuted(next)
    try {
      localStorage.setItem(MUTED_KEY, String(next))
    } catch {
      // Not remembered, then.
    }
  }

  if (secondsLeft <= 0) return null

  const urgent = stage === 'critical' || stage === 'final'
  return (
    <div
      className={`attendance-bomb attendance-bomb--${stage} relative mb-6 flex flex-wrap items-center gap-4 overflow-hidden rounded-xl border p-4 ${
        urgent ? 'border-status-danger-text/60 bg-status-danger-bg' : 'border-status-warning-text/30 bg-status-warning-bg'
      }`}
      role="timer"
      aria-label={`Attendance closes in ${formatCountdown(secondsLeft)}`}
    >
      <BombFigure fuse={fuse} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-gray-900">{STAGE_TEXT[stage]}</div>
        <div className={`attendance-bomb-digits font-mono text-3xl font-bold tabular-nums ${urgent ? 'text-status-danger-text' : 'text-gray-900'}`}>
          {formatCountdown(secondsLeft)}
        </div>
        <div className="text-sm text-gray-600">Attendance closes at {attendanceTimeLabel(closesMin)}.</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? 'Turn the ticking on' : 'Turn the ticking off'}
          title={muted ? 'Turn the ticking on' : 'Turn the ticking off'}
          className="rounded-lg p-2 text-gray-500 hover:bg-black/5"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button type="button" onClick={onFile} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          File attendance
        </button>
      </div>
    </div>
  )
}

type Point = [number, number]
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// The fuse runs from the bomb's cap out to its tip along a curve.
const FUSE_START: Point = [78, 28]
const FUSE_BEND: Point = [86, 2]
const FUSE_TIP: Point = [112, 12]

/** A cartoon bomb with a lit fuse that's `fuse` (0–1) long; the spark sits at its burning end. */
function BombFigure({ fuse }: { fuse: number }) {
  // The first `fuse` of the curve (de Casteljau): its control point and its end, where the spark is.
  const bend = lerp(FUSE_START, FUSE_BEND, fuse)
  const spark = lerp(bend, lerp(FUSE_BEND, FUSE_TIP, fuse), fuse)
  return (
    <svg viewBox="0 0 120 120" className="attendance-bomb-figure h-24 w-24 shrink-0 overflow-visible" aria-hidden="true">
      <defs>
        <radialGradient id="bomb-body" cx="38%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="55%" stopColor="#1f2937" />
          <stop offset="100%" stopColor="#030712" />
        </radialGradient>
      </defs>
      <g className="attendance-bomb-shake">
        <circle className="attendance-bomb-glow" cx="52" cy="74" r="40" fill="#ef4444" />
        <circle cx="52" cy="74" r="38" fill="url(#bomb-body)" />
        <ellipse cx="38" cy="58" rx="10" ry="6" fill="#fff" opacity="0.25" transform="rotate(-35 38 58)" />
        <rect x="64" y="28" width="20" height="14" rx="3" fill="#374151" transform="rotate(35 74 35)" />
        <path
          d={`M${FUSE_START[0]} ${FUSE_START[1]} Q${bend[0]} ${bend[1]} ${spark[0]} ${spark[1]}`}
          fill="none"
          stroke="#a16207"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <g transform={`translate(${spark[0]} ${spark[1]})`}>
          <circle className="attendance-bomb-spark-glow" r="9" fill="#fde047" opacity="0.5" />
          <polygon className="attendance-bomb-spark" points="0,-10 2.5,-3 10,0 2.5,3 0,10 -2.5,3 -10,0 -2.5,-3" fill="#f97316" />
          <circle r="3" fill="#fef9c3" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} className="attendance-bomb-ember" style={{ ['--ember-angle' as string]: `${i * 72 - 60}deg`, animationDelay: `${i * 0.12}s` }} r="1.6" fill="#facc15" />
          ))}
        </g>
      </g>
    </svg>
  )
}
