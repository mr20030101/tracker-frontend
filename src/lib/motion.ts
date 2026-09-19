import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { animate, stagger, type JSAnimation } from 'animejs'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    prefersReducedMotion,
    () => false,
  )
}

interface RevealOptions {
  /** Descendants to animate. Defaults to the element's direct children. */
  selector?: string
  /** Also fade and raise the container itself, just before its children. */
  self?: boolean
  /** Upward travel in px. */
  distance?: number
  /** Milliseconds between consecutive items. */
  step?: number
  /** Milliseconds before the first item starts. */
  delay?: number
  duration?: number
}

// Staggers an element's children in on mount. Runs in a layout effect so the
// items are already hidden on first paint (no flash), and reverts each
// animation when it finishes so no inline opacity/transform is left behind — a
// lingering transform would become the containing block for any
// position: fixed descendant, such as a modal.
export function useReveal<T extends HTMLElement>({
  selector,
  self = false,
  distance = 14,
  step = 60,
  delay = 0,
  duration = 500,
}: RevealOptions = {}) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    const animations: JSAnimation[] = []
    let start = delay

    if (self) {
      animations.push(
        animate(el, {
          opacity: [0, 1],
          translateY: [distance * 1.5, 0],
          scale: [0.985, 1],
          duration,
          ease: 'outCubic',
          onComplete: (a) => a.revert(),
        }),
      )
      start += 160
    }

    const items = selector ? Array.from(el.querySelectorAll<HTMLElement>(selector)) : Array.from(el.children)
    if (items.length) {
      animations.push(
        animate(items, {
          opacity: [0, 1],
          translateY: [distance, 0],
          duration,
          delay: stagger(step, { start }),
          ease: 'outCubic',
          onComplete: (a) => a.revert(),
        }),
      )
    }

    return () => animations.forEach((a) => a.revert())
  }, [selector, self, distance, step, delay, duration])

  return ref
}
