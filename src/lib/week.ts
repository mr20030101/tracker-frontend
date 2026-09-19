// The business week runs Tuesday through the following Monday (7 days).
export const WEEK_LENGTH_DAYS = 7

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const daysSinceTuesday = (d.getDay() - 2 + 7) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysSinceTuesday)
  return d
}

export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + WEEK_LENGTH_DAYS - 1)
  return d
}

export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}, ${e.getFullYear()}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
