// The login mascot: the Grey Owls mark (public/images/greyowls/svg/mark.svg) with moving parts.
// It sits behind the top edge of the login card, so everything below the beak, including the
// resting wings, is hidden by the card. Lifting the wings brings them up over the card edge.
//
// - lookX / lookY (-1..1): where the pupils point, e.g. following the email caret.
// - mood 'cover': both wings over the eyes (typing a password).
// - mood 'peek': wings lowered just enough to see over (password shown).

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
  /** Lighter feathers so the owl shows against the night sky. */
  night?: boolean
}) {
  const pupil = { transform: `translate(${lookX * 6}px, ${lookY * 4}px)` }
  const wing = { transform: `translateY(${WING_LIFT[mood]}px)` }

  return (
    <svg viewBox="0 0 120 170" className={`login-owl h-auto w-full overflow-visible ${night ? 'login-owl-night' : ''}`} aria-hidden="true">
      <path className="login-owl-body" d="M60 35 L14 13 L14 61 A46 46 0 0 0 106 61 L106 13 Z" />
      {[42, 78].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={55} r={17} fill="#ffffff" />
          <g className="login-owl-pupil" style={pupil}>
            <circle cx={cx} cy={55} r={8} fill="#f5b301" />
            <circle cx={cx} cy={55} r={3.5} fill="#1f2329" />
            <circle cx={cx + 2.5} cy={52.5} r={1.6} fill="#ffffff" />
          </g>
          {/* Eyelid: scaled to nothing except for a quick blink. */}
          <ellipse className="login-owl-lid login-owl-body" cx={cx} cy={55} rx={18} ry={18} />
        </g>
      ))}
      <path d="M52 74 L68 74 L60 88 Z" fill="#f5b301" />
      {/* Wings rest out of sight below the card edge (y > 92). */}
      <g className="login-owl-wings" style={wing}>
        <ellipse className="login-owl-wing" cx={40} cy={136} rx={20} ry={24} transform="rotate(-14 40 136)" />
        <ellipse className="login-owl-wing" cx={80} cy={136} rx={20} ry={24} transform="rotate(14 80 136)" />
      </g>
    </svg>
  )
}
