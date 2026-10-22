import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { useSeason } from '../lib/season'
import { useNightSky } from '../lib/theme'
import { LoginOwl, type OwlMood } from './LoginOwl'
import TextLoop from './TextLoop'
import { SkyBackdrop } from './SkyBackdrop'

// The playful banner at the top of both dashboards, matching the login page: the same day/night
// sky, a time-of-day greeting, and the owl mascot peeking up from the bottom edge. Its eyes follow
// the pointer, and clicking it makes it flap and say something encouraging.

const QUIPS = [
  'Hoo-ray, you’re here!',
  'Every task counts. Keep it up!',
  'Wise owls take breaks too.',
  'You’re doing owl-some!',
  'Hoot hoot! Let’s get to work.',
  'Small steps, big progress.',
]

function greeting(name: string | undefined, date: Date): string {
  const first = name?.trim().split(/\s+/)[0]
  const who = first ? `, ${first}` : ''
  const hour = date.getHours()
  if (hour >= 22 || hour < 5) return `Night owl mode${who}!`
  if (hour < 12) return `Good morning${who}!`
  if (hour < 18) return `Good afternoon${who}!`
  return `Good evening${who}!`
}

// The greeting rides a ribbon in the accent colour (orange for Halloween) that flows across the
// banner. Dark ink on it reads the same against the day and the night sky.
const RIBBON = { colour: '#d4a017', halloween: '#ea580c', ink: '#1a1500' }

function dateLine(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

function PeekingOwl({ night }: { night: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const [mood, setMood] = useState<OwlMood>('idle')
  const [quip, setQuip] = useState<string | null>(null)
  // Starts at a random quip on the first click, then cycles.
  const quipIndex = useRef(-1)

  // Pupils track the pointer anywhere on the page, at most once a frame.
  useEffect(() => {
    let frame = 0
    function onMove(e: PointerEvent) {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const box = ref.current?.getBoundingClientRect()
        if (!box) return
        const cx = box.left + box.width / 2
        const cy = box.top + box.height * 0.3
        setLook({ x: clamp((e.clientX - cx) / 300), y: clamp((e.clientY - cy) / 200) })
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Clear the flap and the speech bubble on their own.
  useEffect(() => {
    if (mood === 'idle') return
    const timer = setTimeout(() => setMood('idle'), 350)
    return () => clearTimeout(timer)
  }, [mood])

  useEffect(() => {
    if (!quip) return
    const timer = setTimeout(() => setQuip(null), 2800)
    return () => clearTimeout(timer)
  }, [quip])

  function hoot() {
    quipIndex.current = quipIndex.current < 0 ? Math.floor(Math.random() * QUIPS.length) : (quipIndex.current + 1) % QUIPS.length
    setQuip(QUIPS[quipIndex.current])
    setMood('cover')
  }

  return (
    // The owl is clipped by the banner's bottom edge, so only the head shows.
    <div className="absolute -bottom-[62px] right-4 w-24 sm:right-8">
      {quip && (
        <div
          role="status"
          className="absolute bottom-[96px] right-[72px] w-max max-w-48 rounded-2xl rounded-br-sm bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-md"
        >
          {quip}
        </div>
      )}
      <button
        ref={ref}
        type="button"
        onClick={hoot}
        aria-label="Say hi to the owl"
        className="block w-full cursor-pointer transition-transform hover:-translate-y-1"
      >
        <LoginOwl lookX={look.x} lookY={look.y} mood={mood} night={night} />
      </button>
    </div>
  )
}

export function DashboardHero({ subtitle, actions }: { subtitle: ReactNode; actions?: ReactNode }) {
  const { user } = useAuth()
  const { halloween } = useSeason()
  // Recomputed on render; the dashboards re-render often enough for the greeting to stay current.
  const now = new Date()
  const title = greeting(user?.name, now)
  // The sky can be night on the light theme (or day on the dark one), so the text is coloured for
  // the sky behind it rather than by the theme.
  const night = useNightSky()
  const muted = night ? 'text-[#cdd2db]' : 'text-[#4b5260]'

  return (
    // overflow-clip, not -hidden: a hidden overflow can still be scrolled, and focusing the owl
    // (whose body hangs below the edge) would scroll the whole banner up to show it.
    <section className="relative mb-6 overflow-clip rounded-3xl border border-gray-200">
      <SkyBackdrop compact />
      <div className="relative px-5 pt-5 sm:px-8 sm:pt-7">
        <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${muted}`}>{dateLine(now)}</p>
        {/* Screen readers get the greeting as text; the ribbon only shows it. */}
        <h1 className="sr-only">{title}</h1>
      </div>
      {/* Edge to edge. TextLoop draws into a 1200 × 520 box with the ribbon through the middle, so
          this crops that box to the band the ribbon waves within. Hover pauses it; drag to spin it. */}
      <div className="relative aspect-[1200/190] overflow-hidden" aria-hidden>
        <TextLoop
          text={title}
          shape="wave"
          curviness={14}
          tilt={-2}
          speed={70}
          fontSize={40}
          ribbonWidth={72}
          ribbonColor={halloween ? RIBBON.halloween : RIBBON.colour}
          color={RIBBON.ink}
          separator="✦"
          draggable
          className="absolute left-0 top-1/2 -translate-y-1/2"
        />
      </div>
      {/* The owl gets the bottom-right corner: room underneath on a phone, beside on wider screens. */}
      <div className="relative flex flex-col gap-4 px-5 pb-20 sm:px-8 sm:pb-8 sm:pr-40">
        <p className={`text-sm ${muted}`}>{subtitle}</p>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
      </div>
      <PeekingOwl night={night} />
    </section>
  )
}
