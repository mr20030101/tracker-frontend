import { GrowBar } from './GrowBar'

export function ProgressBar({ value, danger = false }: { value: number; danger?: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const color = danger ? 'bg-red-800' : pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-accent' : 'bg-amber-400'

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
        <GrowBar pct={pct} className={`h-full rounded-full ${color}`} />
      </div>
      <span className="text-xs font-medium text-gray-500">{pct}%</span>
    </div>
  )
}
