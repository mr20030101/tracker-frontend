import { useEffect, useState } from 'react'

// Which microphone and speaker a call uses (lib/call), remembered on this device. On a desktop you
// pick any input or output the browser lists. Phones only offer the loudspeaker or the phone's
// earpiece, the way a normal phone call does.

const STORAGE_KEY = 'call-devices'

// speaker: the loudspeaker · phone: the earpiece, held to your ear
export type SpeakerMode = 'speaker' | 'phone'

export interface CallDevicePrefs {
  // '' is the browser's default device.
  micId: string
  speakerId: string
  speakerMode: SpeakerMode
}

export const DEFAULT_DEVICE_PREFS: CallDevicePrefs = { micId: '', speakerId: '', speakerMode: 'speaker' }

export function loadDevicePrefs(): CallDevicePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<CallDevicePrefs> | null
    if (!saved || typeof saved !== 'object') return DEFAULT_DEVICE_PREFS
    return {
      micId: typeof saved.micId === 'string' ? saved.micId : '',
      speakerId: typeof saved.speakerId === 'string' ? saved.speakerId : '',
      speakerMode: saved.speakerMode === 'phone' ? 'phone' : 'speaker',
    }
  } catch {
    return DEFAULT_DEVICE_PREFS
  }
}

export function saveDevicePrefs(prefs: CallDevicePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Private mode or blocked storage: the choice just lasts until the page reloads.
  }
}

export function isMobileDevice(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile) return true
  // iPadOS reports itself as a Mac; the touch points give it away.
  if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return true
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

// Whether the browser can send call audio to a chosen output (Chrome, Edge, Firefox; not Safari).
export function canChooseOutput(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
}

export interface DeviceOption {
  deviceId: string
  label: string
}

// On phones that list their outputs (Android Chrome), the one to use for a speaker mode, or null
// to leave the output as it is. "Speakerphone" counts as the loudspeaker; "Headphones" is neither.
export function pickOutputForMode(outputs: DeviceOption[], mode: SpeakerMode): string | null {
  const match = mode === 'speaker' ? /speaker/i : /earpiece|receiver|handset|\bphone\b/i
  return outputs.find((d) => match.test(d.label))?.deviceId ?? null
}

// Readable names for a device list. Labels stay empty until the page has been allowed the mic.
export function deviceOptions(devices: MediaDeviceInfo[], kind: MediaDeviceKind): DeviceOption[] {
  const noun = kind === 'audioinput' ? 'Microphone' : 'Speaker'
  return devices
    .filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${noun} ${i + 1}` }))
}

async function listOutputs(): Promise<DeviceOption[]> {
  try {
    return deviceOptions(await navigator.mediaDevices.enumerateDevices(), 'audiooutput')
  } catch {
    return []
  }
}

async function setSink(audio: HTMLAudioElement, deviceId: string) {
  if (!canChooseOutput()) return
  try {
    await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId)
  } catch {
    // The device was unplugged or isn't allowed: the audio stays where it was.
  }
}

// iOS Safari (16.4+): "play-and-record" sends audio to the earpiece, "auto" leaves it on the loudspeaker.
type AudioSessionType = 'auto' | 'play-and-record'
export function setAudioSession(type: AudioSessionType) {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = type
  } catch {
    // ignore
  }
}

// Sends a call's audio element to the chosen output: a picked device on a desktop, the
// loudspeaker or earpiece on a phone.
export async function routeCallAudio(audio: HTMLAudioElement, prefs: CallDevicePrefs, mobile: boolean) {
  if (!mobile) {
    await setSink(audio, prefs.speakerId)
    return
  }
  setAudioSession(prefs.speakerMode === 'phone' ? 'play-and-record' : 'auto')
  const id = pickOutputForMode(await listOutputs(), prefs.speakerMode)
  if (id !== null) await setSink(audio, id)
}

// The microphones and speakers the browser lists, kept up to date as devices are plugged in.
export function useMediaDevices(enabled: boolean) {
  const [devices, setDevices] = useState<{ mics: DeviceOption[]; speakers: DeviceOption[] }>({ mics: [], speakers: [] })
  useEffect(() => {
    if (!enabled || !navigator.mediaDevices?.enumerateDevices) return
    let alive = true
    const refresh = () => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (alive) setDevices({ mics: deviceOptions(list, 'audioinput'), speakers: deviceOptions(list, 'audiooutput') })
        })
        .catch(() => {})
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      alive = false
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [enabled])
  return devices
}
