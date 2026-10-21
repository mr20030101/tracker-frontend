// The attendance countdown's time-bomb beeps, made with Web Audio (no sound files).
// A browser won't play sound until the page has been clicked or typed in, so the context starts
// suspended and the first click or key press anywhere wakes it.

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!context) {
    context = new AudioContext()
    const wake = () => void context?.resume().catch(() => {})
    document.addEventListener('pointerdown', wake, { once: true })
    document.addEventListener('keydown', wake, { once: true })
  }
  return context
}

/** Starts the audio context, so the first beep isn't lost. Call it early, e.g. when the countdown mounts. */
export function prepareBombSound() {
  audio()
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
