// The attendance countdown's time-bomb beeps, made with Web Audio (no sound files).
// A browser won't play sound until the page has been clicked, tapped or typed in, so the context
// starts suspended ("blocked") and every such gesture tries to wake it until one works. Which events
// count differs by browser (Safari wants a click or touchend, not a pointerdown), hence the list.

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const

let context: AudioContext | null = null
const listeners = new Set<() => void>()

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!context) {
    context = new AudioContext()
    context.addEventListener('statechange', () => {
      if (context?.state === 'running') for (const event of UNLOCK_EVENTS) document.removeEventListener(event, unlockBombSound, true)
      listeners.forEach((listener) => listener())
    })
    if (context.state !== 'running') {
      for (const event of UNLOCK_EVENTS) document.addEventListener(event, unlockBombSound, true)
    }
  }
  return context
}

/** Starts the audio context, so the first beep isn't lost. Call it early, e.g. when the countdown mounts. */
export function prepareBombSound() {
  audio()
}

/** Wakes the sound; only works from inside a click, tap or key press. */
export function unlockBombSound() {
  const ctx = audio()
  if (!ctx || ctx.state === 'running') return
  void ctx.resume().catch(() => {})
  // iPhones and iPads also want a sound started inside the gesture: a silent one will do.
  const source = ctx.createBufferSource()
  source.buffer = ctx.createBuffer(1, 1, 22050)
  source.connect(ctx.destination)
  source.start(0)
}

/** True until the browser lets the page play sound. */
export function bombSoundBlocked(): boolean {
  const ctx = audio()
  return Boolean(ctx) && ctx!.state !== 'running'
}

/** Calls `listener` whenever the sound becomes blocked or allowed; returns the unsubscribe. */
export function subscribeBombSound(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// One short tone with a fast attack and an exponential fade, `delay` seconds from now.
function tone(ctx: AudioContext, { type, frequency, duration, volume, delay = 0 }: { type: OscillatorType; frequency: number; duration: number; volume: number; delay?: number }) {
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export type BombSound = 'beep' | 'double-beep'

export function playBombSound(sound: BombSound) {
  const ctx = audio()
  if (!ctx || ctx.state !== 'running') return
  // The classic bomb-timer beep.
  tone(ctx, { type: 'sine', frequency: 2300, duration: 0.11, volume: 0.16 })
  if (sound === 'double-beep') tone(ctx, { type: 'sine', frequency: 2300, duration: 0.11, volume: 0.16, delay: 0.5 })
}
