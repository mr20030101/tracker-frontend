import type { ReactNode, Ref } from 'react'
import { FoldText } from './FoldText'
import { useTheme } from '../lib/theme'
import { LoginOwl, type OwlMood } from './LoginOwl'
import { AppFooter } from './AppFooter'

// The full-page layout shared by the login page and the application form: the app's cream
// backdrop and a centred card with the owl mascot perched on
// its top edge (the bottom of the owl tucks behind the card, the talons grip it in front).
export function PerchedCard({
  lookX = 0,
  lookY = 0,
  mood = 'idle',
  cardRef,
  shaking = false,
  onShakeEnd,
  maxWidthClassName = 'max-w-sm',
  children,
}: {
  lookX?: number
  lookY?: number
  mood?: OwlMood
  cardRef?: Ref<HTMLDivElement>
  /** Plays the card's shake (a failed sign-in); onShakeEnd fires when it's done. */
  shaking?: boolean
  onShakeEnd?: () => void
  maxWidthClassName?: string
  children: ReactNode
}) {
  const night = useTheme().theme === 'dark'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div className={`relative w-full ${maxWidthClassName} pt-20`}>
        <div className="absolute left-1/2 top-0 w-28 -translate-x-1/2">
          <LoginOwl lookX={lookX} lookY={lookY} mood={mood} night={night} />
        </div>
        <div
          className={`relative ${shaking ? 'login-shake' : ''}`}
          onAnimationEnd={(e) => e.animationName === 'login-shake' && onShakeEnd?.()}
        >
          <div ref={cardRef} className="card relative px-6 pb-8 pt-9 sm:px-8">
            <div className="absolute -top-1.5 left-1/2 flex -translate-x-1/2 gap-7" aria-hidden="true">
              <span className="h-3 w-5 rounded-full bg-accent" />
              <span className="h-3 w-5 rounded-full bg-accent" />
            </div>
            {children}
          </div>
        </div>
        <AppFooter className="mt-6" />
      </div>
    </div>
  )
}

/** The centred title and subtitle at the top of a perched card. */
export function CardHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-7 text-center">
      <h1 className="text-4xl font-normal text-gray-900 sm:text-5xl"><FoldText text={title} /></h1>
      {subtitle && <p className="mt-2 text-base text-gray-600">{subtitle}</p>}
    </div>
  )
}
