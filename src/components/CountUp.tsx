import { useLayoutEffect, useRef } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/motion'

interface Props {
  value: number
  format?: (n: number) => string
  duration?: number
}

const defaultFormat = (n: number) => String(Math.round(n))

// Counts from the previously shown value up (or down) to `value`. The text is
// written straight to the DOM and React renders no children, so React and
// anime.js never fight over the same text node.
export function CountUp({ value, format = defaultFormat, duration = 900 }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion()) {
      el.textContent = format(value)
      shown.current = value
      return
    }

    const state = { n: shown.current }
    el.textContent = format(state.n)
    const animation = animate(state, {
      n: value,
      duration,
      ease: 'outExpo',
      onUpdate: () => {
        shown.current = state.n
        el.textContent = format(state.n)
      },
      onComplete: () => {
        shown.current = value
        el.textContent = format(value)
      },
    })
    return () => {
      animation.pause()
    }
  }, [value, duration, format])

  return <span ref={ref} />
}
