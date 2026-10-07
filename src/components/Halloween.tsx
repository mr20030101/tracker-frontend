import { Ghost } from 'lucide-react'
import { useSeason } from '../lib/season'

// The October decorations. All of it is pointer-events-none and aria-hidden, so it never gets in
// the way of a click or a screen reader; the bats stay still for anyone who prefers reduced motion.

function Bat({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 28" className={className} fill="currentColor" aria-hidden="true">
      <g className="halloween-bat-wings">
        <path d="M32 9c-1.6-3-3.3-4.6-5-4.8.6 1.6.5 3-.3 4-2.6-3.4-7.8-5.6-14.2-5 2.6 1.4 4 3.4 4 5.6C13 6.6 6.8 6.5 0 9.5c4.4.6 7.4 2.6 8.6 6 2.6-1.8 6-2.2 9.4-.8-.3 2.1.5 4.4 2.6 6.4 1.6-2.8 4.6-4.4 8-4.8L32 22l3.4-5.7c3.4.4 6.4 2 8 4.8 2.1-2 2.9-4.3 2.6-6.4 3.4-1.4 6.8-1 9.4.8 1.2-3.4 4.2-5.4 8.6-6-6.8-3-13-2.9-16.5-.7 0-2.2 1.4-4.2 4-5.6-6.4-.6-11.6 1.6-14.2 5-.8-1-.9-2.4-.3-4-1.7.2-3.4 1.8-5 4.8Z" />
      </g>
    </svg>
  )
}

export function Pumpkin({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 8c0-2.4 1-4.4 3-5.6" stroke="#4d7c0f" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <ellipse cx="10.5" cy="19" rx="7.5" ry="9.5" fill="#ea580c" />
      <ellipse cx="21.5" cy="19" rx="7.5" ry="9.5" fill="#ea580c" />
      <ellipse cx="16" cy="19" rx="6.5" ry="10" fill="#f97316" />
      <path d="M10 16.5l2.6-2.8 2.4 2.8Zm7 0l2.4-2.8 2.6 2.8Z" fill="#431407" />
      <path d="M9.5 21.5c2 3.4 11 3.4 13 0-1 .4-2 .6-2.8.6l-.9 1.4-1-1.2-2.8.1-.9 1.3-.9-1.4c-1.4 0-2.8-.3-3.7-.8Z" fill="#431407" />
    </svg>
  )
}

function Cobweb({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden="true">
      <path d="M100 0 0 100M100 0 30 100M100 0 62 100M100 0 0 30M100 0 0 62" />
      <path d="M100 18c-4 4-8 2-12 0-1 5-3 9-8 11 3 4 3 8 0 12" />
      <path d="M100 40c-8 6-16 4-22 0-2 9-7 16-15 19 5 7 5 14 1 22" />
      <path d="M100 64c-12 8-24 6-33 0-3 13-10 22-22 26 4 4 6 7 6 10" />
    </svg>
  )
}

/** Bats now and then, and a cobweb in the corner. Rendered once, over the whole app. */
export function HalloweenDecor() {
  const { halloween } = useSeason()
  if (!halloween) return null

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <Cobweb className="absolute -bottom-1 -right-1 h-28 w-28 rotate-90 text-gray-400 opacity-40" />
      <Bat className="halloween-bat absolute left-0 top-[12%] h-5 w-12 text-[#5b3f78] [animation-delay:2s]" />
      <Bat className="halloween-bat absolute left-0 top-[22%] h-3.5 w-8 text-[#5b3f78] opacity-80 [animation-delay:3.2s]" />
      <Bat className="halloween-bat absolute left-0 top-[8%] h-3 w-7 text-[#5b3f78] opacity-70 [animation-delay:16s]" />
    </div>
  )
}

/** Next to the light/dark toggle, through October only: switches the Halloween look off and on. */
export function HalloweenToggle() {
  const { inSeason, halloween, toggleHalloween } = useSeason()
  if (!inSeason) return null

  const label = halloween ? 'Turn off Halloween decorations' : 'Turn on Halloween decorations'
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
