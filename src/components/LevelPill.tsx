import type { ProjectLevel } from '../types'

export const LEVEL_STYLES: Record<ProjectLevel, string> = {
  contributor: 'bg-gray-100 text-gray-600',
  l0: 'bg-sky-100 text-sky-700',
  l1: 'bg-violet-100 text-violet-700',
  l10: 'bg-amber-100 text-amber-700',
}

const LABELS: Record<ProjectLevel, string> = {
  contributor: 'Contributor',
  l0: 'L0',
  l1: 'L1',
  l10: 'L10',
}

export function LevelPill({ level }: { level: ProjectLevel }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLES[level]}`}>
      {LABELS[level]}
    </span>
  )
}
