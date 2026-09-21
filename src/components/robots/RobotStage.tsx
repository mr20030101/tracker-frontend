import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../lib/motion'
import { CAST } from './cast'
import { EDGE_PAD, ROBOT_OPACITY, buildPerformance, collectParts, type Performer } from './engine'

const ROBOT_CLASSES = 'absolute bottom-2 w-32 will-change-transform sm:w-40'
const StillRig = CAST[0].Rig

// One robot's turn on stage. It builds its performance on mount and asks for the
// next robot when the timeline completes. The rig is remounted for every turn,
// so no robot starts from a pose the last one left behind.
function Performance({ performer, onDone }: { performer: Performer; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const stage = root?.parentElement
    if (!root || !stage) return

    let live = true
    const parts = collectParts(root)
    const distance = Math.max(0, stage.clientWidth - root.offsetWidth - 2 * EDGE_PAD)
    // `live` keeps a timeline that has been reverted (React StrictMode runs effects twice) from calling onDone.
    const timeline = buildPerformance(performer, parts, distance, () => live && onDone())
    const ambient = performer.ambient?.(parts) ?? []

    return () => {
      live = false
      timeline.revert()
      ambient.forEach((animation) => animation.revert())
    }
  }, [performer, onDone])

  return (
    <div ref={rootRef} data-part="root" data-robot={performer.id} style={{ left: EDGE_PAD }} className={`${ROBOT_CLASSES} opacity-0`}>
      <performer.Rig />
    </div>
  )
}

// Robots that take the stage one at a time, walking (or rolling, or hovering) in
// from the left, doing their routine in the middle and leaving to the right, along
// the bottom of the page behind the form. Fixed to the form's half of the screen
// (the right 6/11 on desktop, all of it on a phone), and never in the way.
export function RobotStage() {
  const reducedMotion = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const [turn, setTurn] = useState(0)
  // Bumped when the stage is resized, so the current robot starts its turn again with the new distances.
  const [layout, setLayout] = useState(0)
  const next = useCallback(() => setTurn((t) => t + 1), [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || reducedMotion) return
    let width = stage.clientWidth
    let timer = 0
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (stage.clientWidth === width) return
        width = stage.clientWidth
        setLayout((n) => n + 1)
      }, 200)
    })
    observer.observe(stage)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [reducedMotion])

  const performer = CAST[turn % CAST.length]

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-72 overflow-hidden lg:left-[45.4545%]"
    >
      {reducedMotion ? (
        // Reduced motion: the first robot just stands there, as drawn.
        <div data-part="root" data-robot={CAST[0].id} style={{ left: EDGE_PAD, opacity: ROBOT_OPACITY }} className={ROBOT_CLASSES}>
          <StillRig />
        </div>
      ) : (
        <Performance key={`${turn}-${layout}`} performer={performer} onDone={next} />
      )}
    </div>
  )
}
