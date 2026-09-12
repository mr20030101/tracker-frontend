const PALETTE = [
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
  'bg-rose-100 text-rose-800',
  'bg-sky-100 text-sky-800',
  'bg-orange-100 text-orange-800',
]

function colorFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + second).toUpperCase()
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${colorFor(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initialsFor(name)}
    </div>
  )
}
