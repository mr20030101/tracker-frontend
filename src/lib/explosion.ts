// The attendance bomb going off (components/AttendanceBomb), drawn on a full-screen canvas: a
// flash, a fireball that rises and cools from white through orange to soot, sparks thrown out under
// gravity, tumbling debris, a shockwave, smoke that rolls on after the fire, and a scorch mark.
// Kept free of React so it can run anywhere there's a canvas.

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  // Debris only: its angle, spin and outline.
  angle?: number
  spin?: number
  shape?: number[]
  delay?: number
}

const TAU = Math.PI * 2
const between = (min: number, max: number) => min + Math.random() * (max - min)

// Fire's colour as it cools, by how far through its life it is (0 = just born).
const FIRE_STOPS: [number, [number, number, number]][] = [
  [0, [255, 255, 235]],
  [0.12, [255, 236, 140]],
  [0.3, [255, 160, 40]],
  [0.55, [225, 70, 20]],
  [0.8, [120, 30, 15]],
  [1, [40, 20, 15]],
]

function fireColor(t: number): [number, number, number] {
  for (let i = 1; i < FIRE_STOPS.length; i++) {
    const [end, to] = FIRE_STOPS[i]
    const [start, from] = FIRE_STOPS[i - 1]
    if (t <= end) {
      const k = (t - start) / (end - start)
      return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k]
    }
  }
  return FIRE_STOPS[FIRE_STOPS.length - 1][1]
}

function burst(count: number, make: (angle: number) => Particle): Particle[] {
  return Array.from({ length: count }, () => make(Math.random() * TAU))
}

export interface ExplosionOptions {
  // Where the bomb was, in CSS pixels from the top left of the viewport.
  x: number
  y: number
  // Fewer moving parts and no shake, for people who've asked their device to reduce motion.
  reducedMotion?: boolean
  // Shakes this element with the blast (e.g. the app's root); left alone when reducedMotion.
  shake?: HTMLElement | null
  onDone?: () => void
}

/** Runs the explosion on `canvas` (sized to the window here); returns a function that stops it early. */
export function runExplosion(canvas: HTMLCanvasElement, { x, y, reducedMotion = false, shake, onDone }: ExplosionOptions): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    onDone?.()
    return () => {}
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  // Scaled so the blast fills a phone about as much as a desktop.
  const scale = Math.min(1.4, Math.max(0.7, Math.min(width, height) / 700))

  const fire = burst(reducedMotion ? 18 : 70, (a) => {
    const speed = between(60, 420) * scale
    return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.8, age: 0, life: between(0.55, 1.2), size: between(14, 34) * scale }
  })
  const sparks = reducedMotion
    ? []
    : burst(90, (a) => {
        const speed = between(350, 1150) * scale
        return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 200 * scale, age: 0, life: between(0.35, 1.3), size: between(1, 2.4) }
      })
  const debris = reducedMotion
    ? []
    : burst(18, (a) => {
        const speed = between(250, 750) * scale
        const sides = 3 + Math.floor(Math.random() * 3)
        const r = between(3, 8) * scale
        return {
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 350 * scale,
          age: 0,
          life: between(1.6, 2.4),
          size: r,
          angle: Math.random() * TAU,
          spin: between(-14, 14),
          shape: Array.from({ length: sides }, (_, i) => r * between(0.6, 1.2) * (i % 2 ? 1 : 0.8)),
        }
      })
  const smoke = burst(reducedMotion ? 10 : 34, (a) => {
    const speed = between(20, 140) * scale
    return {
      x: x + Math.cos(a) * between(0, 30) * scale,
      y: y + Math.sin(a) * between(0, 30) * scale,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed * 0.6 - between(30, 90) * scale,
      age: 0,
      life: between(1.8, 3),
      size: between(24, 46) * scale,
      // Smoke billows out of the fireball rather than all at once.
      delay: between(0.08, 0.6),
    }
  })
  const embers = reducedMotion
    ? []
    : burst(30, (a) => {
        const speed = between(40, 220) * scale
        return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 120 * scale, age: 0, life: between(1.2, 2.6), size: between(1, 2) }
      })

  const DURATION = 3.2
  let elapsed = 0
  let last = performance.now()
  let frame = 0
  let stopped = false

  function step(p: Particle, dt: number, { gravity = 0, drag = 0, lift = 0 }) {
    p.age += dt
    p.vx *= 1 - drag * dt
    p.vy *= 1 - drag * dt
    p.vy += (gravity - lift) * scale * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  }

  function draw(dt: number) {
    ctx!.clearRect(0, 0, width, height)
    const t = elapsed

    // The scorch mark left behind.
    const scorch = Math.min(1, t / 0.15) * Math.max(0, 1 - t / DURATION)
    if (scorch > 0) {
      const g = ctx!.createRadialGradient(x, y, 0, x, y, 70 * scale)
      g.addColorStop(0, `rgba(20, 12, 8, ${0.55 * scorch})`)
      g.addColorStop(1, 'rgba(20, 12, 8, 0)')
      ctx!.fillStyle = g
      ctx!.fillRect(x - 80 * scale, y - 80 * scale, 160 * scale, 160 * scale)
    }

    // Smoke, under the fire: grey-brown puffs that rise, spread and thin out.
    ctx!.globalCompositeOperation = 'source-over'
    for (const p of smoke) {
      if (t < p.delay!) continue
      step(p, dt, { drag: 1.2, lift: 40 })
      const k = p.age / p.life
      if (k >= 1) continue
      const r = p.size * (1 + k * 2.6)
      const alpha = Math.min(1, p.age / 0.25) * (1 - k) * 0.42
      const shade = 60 + k * 50
      const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
      g.addColorStop(0, `rgba(${shade}, ${shade - 6}, ${shade - 12}, ${alpha})`)
      g.addColorStop(1, `rgba(${shade}, ${shade - 6}, ${shade - 12}, 0)`)
      ctx!.fillStyle = g
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, r, 0, TAU)
      ctx!.fill()
    }

    // Debris: dark chunks that tumble and fall.
    for (const p of debris) {
      step(p, dt, { gravity: 1400, drag: 0.4 })
      const k = p.age / p.life
      if (k >= 1) continue
      p.angle! += p.spin! * dt
      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.angle!)
      ctx!.globalAlpha = 1 - k ** 3
      ctx!.fillStyle = '#1c1917'
      ctx!.beginPath()
      p.shape!.forEach((r, i) => {
        const a = (i / p.shape!.length) * TAU
        if (i === 0) ctx!.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        else ctx!.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      })
      ctx!.closePath()
      ctx!.fill()
      ctx!.restore()
    }
    ctx!.globalAlpha = 1

    // The fireball: glowing blobs added together, so where they overlap burns brighter.
    ctx!.globalCompositeOperation = 'lighter'
    for (const p of fire) {
      step(p, dt, { drag: 3.2, lift: 160 })
      const k = p.age / p.life
      if (k >= 1) continue
      const [r, g, b] = fireColor(k)
      const radius = p.size * (1 + k * 2.2)
      const alpha = (1 - k) ** 1.4 * 0.75
      const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
      grad.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`)
      grad.addColorStop(0.45, `rgba(${r | 0}, ${(g * 0.8) | 0}, ${(b * 0.6) | 0}, ${alpha * 0.55})`)
      grad.addColorStop(1, `rgba(${r | 0}, ${(g * 0.6) | 0}, 0, 0)`)
      ctx!.fillStyle = grad
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, radius, 0, TAU)
      ctx!.fill()
    }

    // Sparks: white-hot streaks drawn along their path, cooling to orange as they fall.
    ctx!.lineCap = 'round'
    for (const p of sparks) {
      const px = p.x
      const py = p.y
      step(p, dt, { gravity: 900, drag: 1.1 })
      const k = p.age / p.life
      if (k >= 1) continue
      const [r, g, b] = fireColor(Math.min(0.6, k * 0.7))
      ctx!.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${1 - k})`
      ctx!.lineWidth = p.size
      ctx!.beginPath()
      ctx!.moveTo(px - (p.x - px) * 1.5, py - (p.y - py) * 1.5)
      ctx!.lineTo(p.x, p.y)
      ctx!.stroke()
    }

    // Embers: small glowing bits drifting up on the heat, flickering out.
    for (const p of embers) {
      step(p, dt, { drag: 1.6, lift: 70 })
      const k = p.age / p.life
      if (k >= 1) continue
      const flicker = 0.6 + Math.random() * 0.4
      ctx!.fillStyle = `rgba(255, ${140 + ((1 - k) * 80) | 0}, 40, ${(1 - k) * flicker})`
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.size, 0, TAU)
      ctx!.fill()
    }

    // The shockwave: a fast ring of pressure, brightest at its leading edge.
    const ring = t / 0.55
    if (ring < 1 && !reducedMotion) {
      const radius = 30 * scale + ring * 420 * scale
      ctx!.strokeStyle = `rgba(255, 240, 210, ${(1 - ring) ** 2 * 0.55})`
      ctx!.lineWidth = (1 - ring) * 14 * scale + 1
      ctx!.beginPath()
      ctx!.arc(x, y, radius, 0, TAU)
      ctx!.stroke()
    }

    // The flash: the whole screen lit from the blast for an instant.
    const flash = t < 0.05 ? t / 0.05 : Math.max(0, 1 - (t - 0.05) / 0.35)
    if (flash > 0) {
      const reach = Math.hypot(width, height)
      const g = ctx!.createRadialGradient(x, y, 0, x, y, reach)
      g.addColorStop(0, `rgba(255, 252, 235, ${flash})`)
      g.addColorStop(0.15, `rgba(255, 210, 140, ${flash * 0.75})`)
      g.addColorStop(0.5, `rgba(255, 140, 60, ${flash * 0.25})`)
      g.addColorStop(1, 'rgba(255, 120, 40, 0)')
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, width, height)
    }
    ctx!.globalCompositeOperation = 'source-over'

    // The page jolts with the blast and settles.
    if (shake && !reducedMotion) {
      const amount = Math.max(0, 1 - t / 0.8) ** 2 * 14
      shake.style.transform = amount > 0.3 ? `translate(${between(-amount, amount)}px, ${between(-amount, amount)}px)` : ''
    }
  }

  function tick(timestamp: number) {
    if (stopped) return
    // Capped, so a frame after the tab was hidden doesn't fling everything off screen.
    const dt = Math.min(0.05, (timestamp - last) / 1000)
    last = timestamp
    elapsed += dt
    draw(dt)
    if (elapsed < DURATION) frame = requestAnimationFrame(tick)
    else finish()
  }

  function finish() {
    stopped = true
    cancelAnimationFrame(frame)
    if (shake) shake.style.transform = ''
    ctx!.clearRect(0, 0, width, height)
    onDone?.()
  }

  frame = requestAnimationFrame(tick)
  return () => {
    if (!stopped) {
      stopped = true
      cancelAnimationFrame(frame)
      if (shake) shake.style.transform = ''
    }
  }
}
