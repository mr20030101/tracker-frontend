import { Circle, Shield, Star, Crown, type LucideIcon } from 'lucide-react'
import type { ProjectLevel } from '../types'

interface LevelTier {
  label: string
  icon: LucideIcon
  badge: string
  ring?: string
}

export const LEVEL_TIERS: Record<ProjectLevel, LevelTier> = {
  contributor: { label: 'Attempt', icon: Circle, badge: 'border-gray-200 bg-gray-50 text-gray-500' },
  l0: { label: 'L0', icon: Shield, badge: 'border-sky-200 bg-sky-50 text-sky-700' },
  l1: { label: 'L1', icon: Star, badge: 'border-violet-200 bg-violet-50 text-violet-700' },
  l10: {
    label: 'L10',
    icon: Crown,
    badge: 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700',
    ring: 'ring-2 ring-amber-200',
  },
}

export function LevelPill({ level }: { level: ProjectLevel }) {
  const tier = LEVEL_TIERS[level]
  const Icon = tier.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${tier.badge} ${tier.ring ?? ''}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {tier.label}
    </span>
  )
}
