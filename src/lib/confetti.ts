import { prefersReducedMotion } from './motion'

// A one-off burst of confetti over the whole page, for a celebration. Drawn on a throwaway canvas
// that ignores the pointer and removes itself when the last piece has fallen. Nothing with
// reduced motion.

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#f97316', '#facc15']
const PIECES = 160
const GRAVITY = 0.32
const DRAG = 0.985

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  angle: number
  spin: number
  round: boolean
}

export function burstConfetti() {
  if (prefersReducedMotion()) return

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const ratio = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * ratio
  canvas.height = height * ratio
  ctx.scale(ratio, ratio)

  // Two cannons, from the lower corners, aimed up and in.
  const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => {
    const left = i % 2 === 0
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7
    const speed = 13 + Math.random() * 9
    return {
      x: left ? width * 0.1 : width * 0.9,
      y: height * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      round: Math.random() < 0.3,
    }
  })

  let frame = 0
  function draw() {
    ctx!.clearRect(0, 0, width, height)
    let alive = 0
    for (const p of pieces) {
      p.vx *= DRAG
      p.vy = p.vy * DRAG + GRAVITY
      p.x += p.vx
      p.y += p.vy
      p.angle += p.spin
      if (p.y > height + 20) continue
      alive++
      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.angle)
      ctx!.fillStyle = p.color
      if (p.round) {
        ctx!.beginPath()
        ctx!.arc(0, 0, p.size / 2.5, 0, Math.PI * 2)
        ctx!.fill()
      } else {
        // Flat paper: squash it as it turns over.
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.angle * 2)) + 1)
      }
      ctx!.restore()
    }
    if (alive > 0) frame = requestAnimationFrame(draw)
    else canvas.remove()
  }
  frame = requestAnimationFrame(draw)

  // A backstop, in case the tab is hidden and frames stop.
  setTimeout(() => {
    cancelAnimationFrame(frame)
    canvas.remove()
  }, 8000)
}
