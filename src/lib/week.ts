// The business week runs Tuesday through the following Monday (7 days).
export const WEEK_LENGTH_DAYS = 7

// Every "today"/"this week"/"this month" in the app is Asia/Singapore's calendar day, not
// whatever timezone a visitor's device happens to be set to. That way a contributor's daily
// goal, the leaderboard's "this week", and a lead's dashboard all agree on which day it is,
// regardless of where anyone physically is. The zone is looked up by name through Intl (the
// runtime's own IANA time zone database) rather than a hardcoded offset, so this stays correct
// on its own if that zone's rules were ever redefined.
const TIME_ZONE = 'Asia/Singapore'

const sgParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

// How far Asia/Singapore's clock is from UTC at this instant, in ms: read the zone's wall-clock
// time for this moment, treat those same numbers as if they were UTC, and diff that against the
// real instant. (Singapore has no DST, so this is the same value for any date, but it's derived
// rather than assumed.)
function sgOffsetMs(date: Date): number {
  const parts = Object.fromEntries(sgParts.formatToParts(date).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - date.getTime()
}

// Re-expresses a moment so its UTC getters/setters read Asia/Singapore's wall clock, letting the
// rest of this file do ordinary UTC-based day/week arithmetic on it.
function toSG(date: Date): Date {
  return new Date(date.getTime() + sgOffsetMs(date))
}

function fromSG(sg: Date): Date {
  return new Date(sg.getTime() - sgOffsetMs(sg))
}

export function startOfWeek(date: Date): Date {
  const sg = toSG(date)
  const daysSinceTuesday = (sg.getUTCDay() - 2 + 7) % 7
  sg.setUTCHours(0, 0, 0, 0)
  sg.setUTCDate(sg.getUTCDate() - daysSinceTuesday)
  return fromSG(sg)
}

export function endOfWeek(date: Date): Date {
  const sg = toSG(startOfWeek(date))
  sg.setUTCDate(sg.getUTCDate() + WEEK_LENGTH_DAYS - 1)
  return fromSG(sg)
}

export function startOfMonth(date: Date): Date {
  const sg = toSG(date)
  sg.setUTCHours(0, 0, 0, 0)
  sg.setUTCDate(1)
  return fromSG(sg)
}

export function endOfMonth(date: Date): Date {
  const sg = toSG(startOfMonth(date))
  sg.setUTCMonth(sg.getUTCMonth() + 1)
  sg.setUTCDate(sg.getUTCDate() - 1)
  return fromSG(sg)
}

/** Year and 0-based month, read as Asia/Singapore's calendar — for "is this the current month" checks. */
export function yearMonth(date: Date): [number, number] {
  const sg = toSG(date)
  return [sg.getUTCFullYear(), sg.getUTCMonth()]
}

export function toISODate(date: Date): string {
  const sg = toSG(date)
  const year = sg.getUTCFullYear()
  const month = String(sg.getUTCMonth() + 1).padStart(2, '0')
  const day = String(sg.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}, ${e.getFullYear()}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
}
