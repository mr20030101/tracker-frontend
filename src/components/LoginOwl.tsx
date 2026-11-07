// The login mascot: the Grey Owls mark (public/images/greyowls/svg/mark.svg) with moving parts.
// It sits on the top edge of the login card and is clipped there, so the resting wings never show;
// lifting them brings them up over the card edge. Colours come from the theme (--owl-*).
//
// - lookX / lookY (-1..1): where the pupils point, e.g. following the email caret.
// - mood 'cover': both wings over the eyes (typing a password).
// - mood 'peek': wings lowered just enough to see over (password shown).

import { useId } from 'react'

export type OwlMood = 'idle' | 'cover' | 'peek'

const WING_LIFT: Record<OwlMood, number> = { idle: 0, cover: -78, peek: -58 }

export function LoginOwl({
  lookX = 0,
  lookY = 0,
  mood = 'idle',
  night = false,
}: {
  lookX?: number
  lookY?: number
  mood?: OwlMood
  /** Lighter feathers so the owl shows on the dark theme's card. */
  night?: boolean
}) {
  const clipId = useId()
  const pupil = { transform: `translate(${lookX * 6}px, ${lookY * 4}px)` }
  const wing = { transform: `translateY(${WING_LIFT[mood]}px)` }

  return (
    <svg viewBox="0 0 120 170" className={`login-owl h-auto w-full overflow-visible ${night ? 'login-owl-night' : ''}`} aria-hidden="true">
      {/* The card's top edge sits at y = 92: nothing of the owl shows below it. */}
      <clipPath id={clipId}>
        <rect x={-40} y={-60} width={200} height={152} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
      <path className="login-owl-body" d="M60 35 L14 13 L14 61 A46 46 0 0 0 106 61 L106 13 Z" />
      {[42, 78].map((cx) => (
        <g key={cx}>
          <circle className="login-owl-white" cx={cx} cy={55} r={17} />
          <g className="login-owl-pupil" style={pupil}>
            <circle className="login-owl-iris" cx={cx} cy={55} r={8} />
            <circle className="login-owl-ink" cx={cx} cy={55} r={3.5} />
            <circle className="login-owl-white" cx={cx + 2.5} cy={52.5} r={1.6} />
          </g>
          {/* Eyelid: scaled to nothing except for a quick blink. */}
          <ellipse className="login-owl-lid login-owl-body" cx={cx} cy={55} rx={18} ry={18} />
        </g>
      ))}
      <path className="login-owl-iris" d="M52 74 L68 74 L60 88 Z" />
      {/* Wings rest out of sight below the card edge (y > 92). */}
      <g className="login-owl-wings" style={wing}>
        <ellipse className="login-owl-wing" cx={40} cy={136} rx={20} ry={24} transform="rotate(-14 40 136)" />
        <ellipse className="login-owl-wing" cx={80} cy={136} rx={20} ry={24} transform="rotate(14 80 136)" />
      </g>
      </g>
    </svg>
  )
}
