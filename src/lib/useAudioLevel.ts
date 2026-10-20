import { useEffect, type RefObject } from 'react'

// How loud a call's audio is right now, written as a 0–1 CSS variable on an element every frame
// (no re-renders), so the call card's rings and bars can move with the voice.

let sharedContext: AudioContext | null = null
function audioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  sharedContext ??= new AudioContext()
  if (sharedContext.state === 'suspended') void sharedContext.resume().catch(() => {})
  return sharedContext
}

export function useAudioLevel(stream: MediaStream | null, target: RefObject<HTMLElement | null>, variable: string) {
  useEffect(() => {
    const el = target.current
    if (!el || !stream || stream.getAudioTracks().length === 0) return
    const ctx = audioContext()
    if (!ctx) return
    let source: MediaStreamAudioSourceNode
    try {
      source = ctx.createMediaStreamSource(stream)
    } catch {
      return
    }
    // Only listened to, never connected to the speakers, so nothing is heard twice.
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let level = 0
    let frame = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const s of samples) sum += s * s
      // Speech sits around 0.02–0.2 RMS; scale it up and let it fall back slowly, like a VU meter.
      const now = Math.min(1, Math.sqrt(sum / samples.length) * 6)
      level = now > level ? now : level * 0.9
      el.style.setProperty(variable, level.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      source.disconnect()
      analyser.disconnect()
      el.style.removeProperty(variable)
    }
  }, [stream, target, variable])
}
