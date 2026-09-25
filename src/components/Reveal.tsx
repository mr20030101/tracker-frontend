import type { ReactNode } from 'react'
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
  // Typed as a div for JSX's sake: a bare ElementType would also span three.js's JSX elements (from
  // the office's react-three-fiber), whose props don't fit these. Any of the allowed tags works the same.
  const ref = useReveal<HTMLDivElement>(options)
  const Component = as as 'div'
  return (
    <Component ref={ref} className={className}>
      {children}
    </Component>
  )
}
