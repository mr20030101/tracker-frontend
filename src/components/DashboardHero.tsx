import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { useNightSky } from '../lib/theme'
import { LoginOwl, type OwlMood } from './LoginOwl'
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
  // Recomputed on render; the dashboards re-render often enough for the greeting to stay current.
  const title = greeting(user?.name, new Date())
  // The sky can be night on the light theme (or day on the dark one), so the text is coloured for
  // the sky behind it rather than by the theme.
  const night = useNightSky()

  return (
    // overflow-clip, not -hidden: a hidden overflow can still be scrolled, and focusing the owl
    // (whose body hangs below the edge) would scroll the whole banner up to show it.
    <section className="relative mb-6 overflow-clip rounded-3xl border border-gray-200">
      <SkyBackdrop compact />
      {/* The owl gets the bottom-right corner: room underneath on a phone, beside on wider screens. */}
      <div className="relative flex flex-col gap-4 px-5 pb-20 pt-5 sm:px-8 sm:pb-8 sm:pr-40 sm:pt-7">
        <div>
          <h1 className={`text-2xl font-bold sm:text-3xl ${night ? 'text-[#f5f6f8]' : 'text-[#1f2329]'}`}>{title}</h1>
          <p className={`mt-1 text-sm ${night ? 'text-[#cdd2db]' : 'text-[#4b5260]'}`}>{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
      </div>
      <PeekingOwl night={night} />
    </section>
  )
}
