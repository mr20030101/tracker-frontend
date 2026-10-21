import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Minus, Volume2, VolumeX, X } from 'lucide-react'
import { ATTENDANCE_OPENS_MIN, attendanceTimeLabel, attendanceWindow, fetchOwnAttendance } from '../lib/attendance'
import { useAuth } from '../lib/auth'
import { bombSoundBlocked, playBombSound, playExplosion, prepareBombSound, subscribeBombSound, unlockBombSound, type BombSound } from '../lib/bombSound'
import { runExplosion } from '../lib/explosion'
import { useAttendanceClosesMin } from '../lib/useAttendanceClosesMin'
import { sgMinutesSinceMidnight, todayIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import { AttendanceFormModal } from './AttendanceFormModal'

// The contributor's "you haven't filed attendance yet" countdown, floating in the corner of every
// page: a bomb whose fuse burns down to the closing time, beeping like a time bomb in the last five
// minutes. Gone once they've filed or the window has closed.

const MUTED_KEY = 'attendance-bomb-muted'
// Shrunk to a small pill; only for this browser session, so it's back in full the next day.
const MINIMIZED_KEY = 'attendance-bomb-minimized'

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
  calm: 'Attendance not filed yet',
  warning: 'Under an hour left!',
  critical: 'Hurry! Closing soon!',
  final: 'Last seconds! File NOW!',
}

function readFlag(storage: () => Storage, key: string): boolean {
  try {
    return storage().getItem(key) === 'true'
  } catch {
    return false
  }
}

function writeFlag(storage: () => Storage, key: string, value: boolean) {
  try {
    storage().setItem(key, String(value))
  } catch {
    // Not remembered, then.
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

/** Shown to contributors on every page (AppShell) while today's attendance is open and not filed. */
export function AttendanceBomb() {
  const { user } = useAuth()
  const now = useNow(1000)
  const today = todayIso(now)
  const isContributor = user?.role === 'contributor'
  const { closesMin } = useAttendanceClosesMin()
  // The same query as the Dashboard's button, so filing from either hides the bomb.
  const { data: todaysAttendance } = useQuery({
    queryKey: ['attendance', 'own', user?.id, today],
    queryFn: () => fetchOwnAttendance(user!.id, today),
    enabled: Boolean(user && isContributor),
  })
  const [filing, setFiling] = useState(false)

  // Only once we know they haven't filed (null, not still loading).
  const windowState = attendanceWindow(new Date(now), closesMin)
  const show = isContributor && todaysAttendance === null && windowState === 'open'
  // The bomb goes off when time runs out with nothing filed (not when it goes because they filed).
  const [wasShown, setWasShown] = useState(show)
  const [exploding, setExploding] = useState(false)
  if (show !== wasShown) {
    setWasShown(show)
    if (!show && windowState === 'closed' && todaysAttendance === null) setExploding(true)
  }

  return (
    <>
      {exploding && <Explosion closesMin={closesMin} onDone={() => setExploding(false)} />}
      {show && <FloatingBomb secondsLeft={secondsUntilClose(new Date(now), closesMin)} closesMin={closesMin} silent={filing} onFile={() => setFiling(true)} />}
      {filing && user && (
        <AttendanceFormModal person={{ id: user.id, name: user.name, email: user.email }} date={today} existing={todaysAttendance ?? null} onClose={() => setFiling(false)} />
      )}
    </>
  )
}

// The same corner as the floating bomb, so the blast comes from where it was.
const FLOATING_POSITION = 'fixed bottom-3 right-3 lg:bottom-6 lg:right-24'
const FLOATING_WIDTH = 'w-[min(22rem,calc(100vw-1.5rem))]'

/** Time's up: the bomb goes off where it was (see lib/explosion), with a boom; then a note that attendance has closed. */
function Explosion({ closesMin, onDone }: { closesMin: number; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // An invisible stand-in for the bomb card, to find where the bomb was.
  const markerRef = useRef<HTMLDivElement>(null)
  const [blasting, setBlasting] = useState(true)
  const [showNote, setShowNote] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const marker = markerRef.current?.getBoundingClientRect()
    if (!canvas || !marker) return
    if (!readFlag(() => localStorage, MUTED_KEY)) playExplosion()
    const stop = runExplosion(canvas, {
      // The bomb sits at the card's left, halfway down.
      x: marker.left + 44,
      y: marker.top + marker.height / 2,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      shake: document.getElementById('root'),
      onDone: () => setBlasting(false),
    })
    // The note comes in as the fire dies down, while the smoke still rolls.
    const note = setTimeout(() => setShowNote(true), 1300)
    return () => {
      stop()
      clearTimeout(note)
    }
  }, [])

  return (
    <>
      {blasting && (
        <>
          <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />
          <div ref={markerRef} aria-hidden="true" className={`${FLOATING_POSITION} ${FLOATING_WIDTH} pointer-events-none invisible h-[5.5rem]`} />
        </>
      )}
      {showNote && (
        <div role="alert" className={`${FLOATING_POSITION} ${FLOATING_WIDTH} attendance-boom-note z-40 flex items-start gap-3 rounded-2xl border border-status-danger-text/60 bg-status-danger-bg p-4 shadow-lg`}>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-status-danger-text">BOOM! Attendance has closed.</div>
            <div className="text-sm text-gray-700">It closed at {attendanceTimeLabel(closesMin)}. Ask your lead to file today's attendance for you.</div>
          </div>
          <button type="button" onClick={onDone} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}

function FloatingBomb({ secondsLeft, closesMin, silent, onFile }: { secondsLeft: number; closesMin: number; silent: boolean; onFile: () => void }) {
  const [muted, setMuted] = useState(() => readFlag(() => localStorage, MUTED_KEY))
  const [minimized, setMinimized] = useState(() => readFlag(() => sessionStorage, MINIMIZED_KEY))
  const stage = stageFor(secondsLeft)
  const urgent = stage === 'critical' || stage === 'final'
  // How much of the fuse is left: all of it at opening time, none at closing.
  const fuse = Math.min(1, Math.max(0, secondsLeft / ((closesMin - ATTENDANCE_OPENS_MIN) * 60)))

  useEffect(prepareBombSound, [])
  // The browser holds sound back until the page is clicked; the speaker says so, and clicking it
  // (or anything else) lets the beeps through.
  const blocked = useSyncExternalStore(subscribeBombSound, bombSoundBlocked)

  useEffect(() => {
    const sound = soundFor(secondsLeft)
    if (sound && !muted && !silent) playBombSound(sound)
  }, [secondsLeft, muted, silent])

  function toggleMuted() {
    if (blocked && !muted) return unlockBombSound()
    setMuted(!muted)
    writeFlag(() => localStorage, MUTED_KEY, !muted)
  }

  function toggleMinimized() {
    setMinimized(!minimized)
    writeFlag(() => sessionStorage, MINIMIZED_KEY, !minimized)
  }

  // Bottom right on a phone; on a desktop, just left of the online people's chat bubbles. Under
  // the chat window (z-50), so an open conversation isn't covered.
  const position = `${FLOATING_POSITION} z-40`
  const tone = urgent ? 'border-status-danger-text/60 bg-status-danger-bg' : 'border-status-warning-text/40 bg-status-warning-bg'
  const digitsTone = urgent ? 'text-status-danger-text' : 'text-gray-900'
  const soundLabel = muted ? 'Turn the beeping on' : blocked ? 'Your browser is holding the sound back. Click to allow it.' : 'Turn the beeping off'
  const label = `Attendance closes in ${formatCountdown(secondsLeft)}`

  if (minimized) {
    return (
      <button
        type="button"
        onClick={toggleMinimized}
        className={`attendance-bomb attendance-bomb--${stage} ${position} flex items-center gap-1 rounded-full border py-1 pl-1 pr-3 shadow-lg ${tone}`}
        aria-label={`${label}. Show the attendance timer`}
        title="Show the attendance timer"
      >
        <BombFigure fuse={fuse} className="h-10 w-10" />
        <span className={`attendance-bomb-digits font-mono text-base font-bold tabular-nums ${digitsTone}`}>{formatCountdown(secondsLeft)}</span>
      </button>
    )
  }

  return (
    <div
      className={`attendance-bomb attendance-bomb--${stage} ${position} flex ${FLOATING_WIDTH} items-center gap-3 rounded-2xl border p-3 shadow-lg ${tone}`}
      role="timer"
      aria-label={label}
    >
      <BombFigure fuse={fuse} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-gray-900">{STAGE_TEXT[stage]}</div>
        <div className={`attendance-bomb-digits font-mono text-2xl font-bold tabular-nums ${digitsTone}`}>{formatCountdown(secondsLeft)}</div>
        <div className="text-xs text-gray-600">
          Closes at {attendanceTimeLabel(closesMin)}
          {blocked && !muted && (
            <button type="button" onClick={unlockBombSound} className="ml-1 font-semibold text-status-warning-text underline">
              Allow sound
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center">
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={soundLabel}
            title={soundLabel}
            className={`rounded-md p-1.5 hover:bg-black/5 ${blocked && !muted ? 'text-status-warning-text' : 'text-gray-500'}`}
          >
            {muted || blocked ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleMinimized}
            aria-label="Shrink the attendance timer"
            title="Shrink"
            className="rounded-md p-1.5 text-gray-500 hover:bg-black/5"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={onFile} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white hover:bg-red-700">
          File now
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
function BombFigure({ fuse, className }: { fuse: number; className: string }) {
  // The first `fuse` of the curve (de Casteljau): its control point and its end, where the spark is.
  const bend = lerp(FUSE_START, FUSE_BEND, fuse)
  const spark = lerp(bend, lerp(FUSE_BEND, FUSE_TIP, fuse), fuse)
  return (
    <svg viewBox="0 0 120 120" className={`attendance-bomb-figure shrink-0 overflow-visible ${className}`} aria-hidden="true">
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
