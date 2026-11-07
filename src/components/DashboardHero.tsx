import type { ReactNode } from 'react'
import { FoldText } from './FoldText'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { CountUp } from './CountUp'

function greeting(name: string | undefined, date: Date): string {
  const first = name?.trim().split(/\s+/)[0]
  const who = first ? `, ${first}` : ''
  const hour = date.getHours()
  if (hour >= 22 || hour < 5) return `Night owl mode${who}`
  if (hour < 12) return `Good morning${who}`
  if (hour < 18) return `Good afternoon${who}`
  return `Good evening${who}`
}

function dateLine(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export interface HeroStat {
  value: number
  label: string
  icon: LucideIcon
}

export interface HeroMeter {
  label: string
  // 0–100; drawn as the filled share of the pill.
  pct: number
  tone: 'night' | 'honey' | 'striped' | 'outline'
  // What the pill reads, when a plain percentage would say less (e.g. "12 / 40").
  text?: string
}

const METER_FILL: Record<HeroMeter['tone'], string> = {
  night: 'bg-ink text-ink-foreground',
  honey: 'bg-accent text-accent-foreground',
  striped: 'meter-stripes text-gray-800',
  outline: 'border border-ink/70 text-gray-800',
}

function Meter({ label, pct, tone, text }: HeroMeter) {
  const width = Math.max(0, Math.min(100, pct))
  const filled = tone === 'night' || tone === 'honey'
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs text-gray-600">{label}</div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        className={`relative flex h-9 items-center overflow-hidden rounded-full text-xs font-medium ${
          filled ? 'bg-white/70 shadow-card' : METER_FILL[tone]
        }`}
      >
        {filled && <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-soft ${METER_FILL[tone]}`} style={{ width: `${width}%`, minWidth: width > 0 ? '2.25rem' : 0 }} />}
        <span
          className={`relative tabular-nums ${filled && width <= 18 ? 'pl-12 pr-4' : 'px-4'} ${
            filled && width > 18 ? (tone === 'night' ? 'text-ink-foreground' : 'text-accent-foreground') : 'text-gray-800'
          }`}
        >
          {text ?? `${Math.round(width)}%`}
        </span>
      </div>
    </div>
  )
}

/** The top of both dashboards: the greeting in large type, the period's meters and headline numbers, then the page's actions. */
export function DashboardHero({
  subtitle,
  actions,
  stats = [],
  meters = [],
}: {
  subtitle: ReactNode
  actions?: ReactNode
  stats?: HeroStat[]
  meters?: HeroMeter[]
}) {
  const { user } = useAuth()
  const now = new Date()

  return (
    <section className="mb-8">
      <p className="text-sm text-gray-500">{dateLine(now)}</p>
      <h1 className="mt-1 text-4xl font-normal text-gray-900 sm:text-5xl lg:text-6xl"><FoldText text={greeting(user?.name, now)} /></h1>
      <p className="mt-3 max-w-2xl text-base text-gray-600">{subtitle}</p>

      {(meters.length > 0 || stats.length > 0) && (
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-10">
          {meters.length > 0 && (
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-4">
              {meters.map((meter) => (
                <Meter key={meter.label} {...meter} />
              ))}
            </div>
          )}
          {stats.length > 0 && (
            <dl className="flex shrink-0 justify-between gap-8 sm:justify-start sm:gap-10">
              {stats.map(({ value, label, icon: Icon }) => (
                <div key={label} className="flex flex-col">
                  <dd className="order-1 font-display text-5xl font-light leading-none tracking-tight text-gray-900 tabular-nums lg:text-6xl">
                    <CountUp value={value} />
                  </dd>
                  <dt className="order-2 mt-2 flex items-center gap-1.5 text-sm text-gray-600">
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {actions && <div className="mt-7 flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
    </section>
  )
}
