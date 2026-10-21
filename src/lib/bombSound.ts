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

// Decaying white noise, `seconds` long, falling away with `curve` (higher dies faster).
function noiseBuffer(ctx: AudioContext, seconds: number, curve: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** curve
  }
  return buffer
}

function noise(ctx: AudioContext, out: AudioNode, { seconds, curve, type, from, to, volume, at }: { seconds: number; curve: number; type: BiquadFilterType; from: number; to: number; volume: number; at: number }) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx, seconds, curve)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(from, at)
  filter.frequency.exponentialRampToValueAtTime(to, at + seconds)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, at)
  source.connect(filter).connect(gain).connect(out)
  source.start(at)
}

/** Time's up: a sharp crack, the roar of the blast, a deep thump you feel, and a rumble rolling away. */
export function playExplosion() {
  const ctx = audio()
  if (!ctx || ctx.state !== 'running') return
  const at = ctx.currentTime + 0.01

  // Everything through a compressor, so it's loud and full without crackling.
  const out = ctx.createDynamicsCompressor()
  out.threshold.value = -18
  out.ratio.value = 6
  out.attack.value = 0.002
  out.release.value = 0.4
  const master = ctx.createGain()
  master.gain.value = 0.9
  out.connect(master).connect(ctx.destination)

  // The crack: a very short, bright burst.
  noise(ctx, out, { seconds: 0.12, curve: 4, type: 'highpass', from: 1800, to: 900, volume: 0.9, at })
  // The roar: broadband noise that darkens as it dies.
  noise(ctx, out, { seconds: 1.6, curve: 2.2, type: 'lowpass', from: 4500, to: 220, volume: 1, at })
  // The rumble: low noise rolling on long after.
  noise(ctx, out, { seconds: 3.2, curve: 1.6, type: 'lowpass', from: 260, to: 60, volume: 1.1, at: at + 0.05 })

  // The thump: a sub-bass punch that drops in pitch.
  const thump = ctx.createOscillator()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(140, at)
  thump.frequency.exponentialRampToValueAtTime(28, at + 0.7)
  const thumpGain = ctx.createGain()
  thumpGain.gain.setValueAtTime(0.0001, at)
  thumpGain.gain.exponentialRampToValueAtTime(1, at + 0.01)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, at + 1)
  thump.connect(thumpGain).connect(out)
  thump.start(at)
  thump.stop(at + 1.05)
}
