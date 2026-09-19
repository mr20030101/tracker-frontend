import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, createTimeline, utils, type JSAnimation, type Timeline } from 'animejs'

// Redraws public/images/greyowls/pattern/owls-tile-*.svg as inline SVG so the
// owls can be animated (anime.js can't reach inside an <img> or a CSS
// background). Geometry is taken from the tile: owls sit on a 60px checkerboard
// lattice, each rotated -18°. Shifting the whole lattice by exactly one cell
// diagonally lands every owl on another owl, so the drift loops seamlessly.
const CELL = 60
const ORIGIN_X = 28.9
const ORIGIN_Y = 26.5
const SCALE = 0.3696
const ANGLE = -18
const SPARK_COUNT = 8
const DRIFT_MS = 60_000

// Owl silhouette with the eye rings knocked out and the pupils filled back in
// (even-odd), in the owl's own 0–120 coordinate space.
const OWL_PATH =
  'M60 35 L14 13 L14 61 A46 46 0 0 0 106 61 L106 13 Z M41 37 A18 18 0 1 1 41 73 A18 18 0 1 1 41 37 Z M79 37 A18 18 0 1 1 79 73 A18 18 0 1 1 79 37 Z M41 46 A9 9 0 1 1 41 64 A9 9 0 1 1 41 46 Z M79 46 A9 9 0 1 1 79 64 A9 9 0 1 1 79 46 Z'

// Puts the owl's centre (60, 50) at (x, y), rotated and scaled as in the tile.
const owlTransform = (x: number, y: number) =>
  `translate(${x} ${y}) rotate(${ANGLE}) scale(${SCALE}) translate(-60 -50)`

interface Size {
  w: number
  h: number
}

const currentSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight })

export function OwlField() {
  const [size, setSize] = useState(currentSize)
  const driftRef = useRef<SVGGElement>(null)
  const sparksRef = useRef<SVGGElement>(null)

  useEffect(() => {
    let timer = 0
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setSize(currentSize()), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const owls = useMemo(() => {
    const cols = Math.ceil(size.w / CELL) + 3
    const rows = Math.ceil(size.h / CELL) + 3
    const points: { x: number; y: number }[] = []
    for (let b = -2; b < rows; b++) {
      for (let a = -2; a < cols; a++) {
        if ((a + b) % 2 !== 0) continue
        points.push({ x: ORIGIN_X + a * CELL, y: ORIGIN_Y + b * CELL })
      }
    }
    return points
  }, [size.w, size.h])

  useEffect(() => {
    const drift = driftRef.current
    const sparks = Array.from(sparksRef.current?.children ?? []) as SVGGElement[]
    if (!drift) return

    let disposed = false
    const active = new Map<SVGGElement, Timeline>()
    const driftAnimation: JSAnimation = animate(drift, {
      translateX: [0, CELL],
      translateY: [0, CELL],
      duration: DRIFT_MS,
      ease: 'linear',
      loop: true,
    })

    // Each spark picks a random lattice owl, fades its glowing eyes in, blinks
    // twice, fades out, then does it again somewhere else.
    const wake = (spark: SVGGElement) => {
      if (disposed) return
      const cols = Math.max(2, Math.floor((window.innerWidth - 2 * CELL) / CELL))
      const rows = Math.max(2, Math.floor((window.innerHeight - 2 * CELL) / CELL))
      let a = utils.random(1, cols)
      const b = utils.random(1, rows)
      if ((a + b) % 2 !== 0) a += 1
      spark.setAttribute('transform', `translate(${ORIGIN_X + a * CELL} ${ORIGIN_Y + b * CELL})`)

      const eyes = spark.querySelectorAll('circle')
      const timeline = createTimeline({ delay: utils.random(300, 3500), onComplete: () => wake(spark) })
      timeline
        .add(spark, { opacity: [0, 0.6], duration: 900, ease: 'outSine' }, 0)
        .add(eyes, { scaleY: [1, 0.08, 1], duration: 280, ease: 'inOutSine' }, 2200)
        .add(eyes, { scaleY: [1, 0.08, 1], duration: 280, ease: 'inOutSine' }, 2700)
        .add(spark, { opacity: 0, duration: 1100, ease: 'inSine' }, 4800)
      active.set(spark, timeline)
    }
    sparks.forEach(wake)

    return () => {
      disposed = true
      driftAnimation.revert()
      active.forEach((timeline) => timeline.revert())
    }
  }, [])

  return (
    <div className="owl-field pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg className="h-full w-full" width={size.w} height={size.h}>
        <defs>
          <path id="owl-silhouette" d={OWL_PATH} />
        </defs>
        <g ref={driftRef}>
          {owls.map((p) => (
            <use key={`${p.x}:${p.y}`} href="#owl-silhouette" className="owl-static" transform={owlTransform(p.x, p.y)} />
          ))}
          <g ref={sparksRef}>
            {Array.from({ length: SPARK_COUNT }, (_, i) => (
              <g key={i} className="owl-spark">
                <g transform={`rotate(${ANGLE}) scale(${SCALE}) translate(-60 -50)`}>
                  <circle className="owl-eye owl-halo" cx="41" cy="55" r="17" />
                  <circle className="owl-eye owl-halo" cx="79" cy="55" r="17" />
                  <circle className="owl-eye owl-pupil" cx="41" cy="55" r="9" />
                  <circle className="owl-eye owl-pupil" cx="79" cy="55" r="9" />
                </g>
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  )
}
