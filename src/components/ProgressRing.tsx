interface Props {
  value: number
  size?: number
  strokeWidth?: number
  label: string
  sublabel: string
}

export function ProgressRing({ value, size = 120, strokeWidth = 10, label, sublabel }: Props) {
  const pct = Math.min(1, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  const color = pct >= 1 ? '#10b981' : pct >= 0.5 ? '#d4a017' : '#f59e0b'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#f3f4f6" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold text-gray-900">{Math.round(pct * 100)}%</span>
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-400">{sublabel}</span>
      </div>
    </div>
  )
}
