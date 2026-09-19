import { useLayoutEffect, useRef } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/motion'
import { CountUp } from './CountUp'

interface Props {
  value: number
  size?: number
  strokeWidth?: number
  label: string
  sublabel: string
}

const formatPercent = (n: number) => `${Math.round(n)}%`

export function ProgressRing({ value, size = 120, strokeWidth = 10, label, sublabel }: Props) {
  const pct = Math.min(1, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  const color = pct >= 1 ? '#10b981' : pct >= 0.5 ? '#d4a017' : '#f59e0b'

  // Sweeps the arc from where it was (fully empty on first render) to the new value.
  const arcRef = useRef<SVGCircleElement>(null)
  const shownOffset = useRef(circumference)

  useLayoutEffect(() => {
    const arc = arcRef.current
    if (!arc) return

    if (prefersReducedMotion()) {
      shownOffset.current = offset
      return
    }

    const animation = animate(arc, {
      strokeDashoffset: [shownOffset.current, offset],
      duration: 1100,
      ease: 'outCubic',
      onUpdate: () => {
        shownOffset.current = parseFloat(arc.style.strokeDashoffset)
      },
      onComplete: () => {
        shownOffset.current = offset
      },
    })
    return () => {
      animation.pause()
    }
  }, [offset])

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-100"
        />
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold text-gray-900">
          <CountUp value={Math.round(pct * 100)} format={formatPercent} />
        </span>
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-400">{sublabel}</span>
      </div>
    </div>
  )
}
