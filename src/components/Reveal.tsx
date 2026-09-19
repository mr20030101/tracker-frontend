import type { ElementType, ReactNode } from 'react'
import { useReveal } from '../lib/motion'

interface Props {
  as?: 'div' | 'ul' | 'ol' | 'section'
  className?: string
  children: ReactNode
  /** Milliseconds between consecutive children. */
  step?: number
  /** Milliseconds before the first child starts. */
  delay?: number
  distance?: number
}

// Staggers its direct children in when it mounts (see useReveal). Render it
// only once the content exists, e.g. after data has loaded, so the entrance
// plays when the content appears.
export function Reveal({ as = 'div', className, children, ...options }: Props) {
  const ref = useReveal<HTMLElement>(options)
  const Component = as as ElementType
  return (
    <Component ref={ref} className={className}>
      {children}
    </Component>
  )
}
