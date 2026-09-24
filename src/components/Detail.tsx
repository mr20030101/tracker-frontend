import type { ReactNode } from 'react'

// One label/value row of a details modal. Put the rows inside a <dl>.
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-800">{children}</dd>
    </div>
  )
}
