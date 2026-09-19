import { useLayoutEffect, useRef } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/motion'

interface Props {
  /** Fill width, 0–100. */
  pct: number
  className?: string
  /** Delay before growing, so a list of bars can cascade. */
  delay?: number
}

// A progress-bar fill that grows from its previous width (0 on first render)
// to `pct`. The final width is also set through `style`, so it's correct with
// reduced motion or if the animation is interrupted.
export function GrowBar({ pct, className = '', delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion()) {
      shown.current = pct
      return
    }

    const animation = animate(el, {
      width: [`${shown.current}%`, `${pct}%`],
      duration: 800,
      delay,
      ease: 'outCubic',
      onUpdate: () => {
        shown.current = parseFloat(el.style.width)
      },
      onComplete: () => {
        shown.current = pct
      },
    })
    return () => {
      animation.pause()
    }
  }, [pct, delay])

  return <div ref={ref} className={className} style={{ width: `${pct}%` }} />
}
