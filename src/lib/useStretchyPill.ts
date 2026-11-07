import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { prefersReducedMotion } from './motion'

const DURATION = 520
const TRAIL_DELAY = 70
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'

interface Box {
  start: number
  end: number
  crossStart: number
  crossEnd: number
  // Whether the last move went down/right, which decides which edge leads.
  forward: boolean
}

/**
 * Positions a highlight pill behind the active item inside `container`, and moves it the way a
 * drop of honey would: the leading edge sets off first and the trailing edge catches up, so it
 * stretches toward the new item and settles. `axis` is the direction the items run in.
 */
export function useStretchyPill(
  container: RefObject<HTMLElement | null>,
  activeSelector: string,
  axis: 'x' | 'y',
  deps: unknown[],
): CSSProperties {
  const [box, setBox] = useState<Box | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    const measure = () => {
      const active = root.querySelector<HTMLElement>(activeSelector)
      if (!active) return setBox(null)
      const outer = root.getBoundingClientRect()
      const inner = active.getBoundingClientRect()
      const edges =
        axis === 'y'
          ? { start: inner.top - outer.top, end: outer.bottom - inner.bottom, crossStart: inner.left - outer.left, crossEnd: outer.right - inner.right }
          : { start: inner.left - outer.left, end: outer.right - inner.right, crossStart: inner.top - outer.top, crossEnd: outer.bottom - inner.bottom }
      setBox((prev) => {
        if (prev && prev.start === edges.start && prev.end === edges.end && prev.crossStart === edges.crossStart && prev.crossEnd === edges.crossEnd) return prev
        return { ...edges, forward: prev ? edges.start > prev.start : true }
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, activeSelector, axis, ...deps])

  // The first placement just appears; only later moves animate.
  useLayoutEffect(() => {
    if (!box || animate) return
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [box, animate])

  if (!box) return { display: 'none' }
  const { forward } = box

  const [startProp, endProp, crossStartProp, crossEndProp] = axis === 'y' ? ['top', 'bottom', 'left', 'right'] : ['left', 'right', 'top', 'bottom']
  const still = !animate || prefersReducedMotion()
  const edge = (prop: string, leading: boolean) => `${prop} ${DURATION}ms ${EASE} ${leading ? 0 : TRAIL_DELAY}ms`
  return {
    position: 'absolute',
    [startProp]: box.start,
    [endProp]: box.end,
    [crossStartProp]: box.crossStart,
    [crossEndProp]: box.crossEnd,
    transition: still
      ? 'none'
      : [edge(startProp, !forward), edge(endProp, forward), `${crossStartProp} 200ms ${EASE}`, `${crossEndProp} 200ms ${EASE}`].join(', '),
  }
}
