// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_DEVICE_PREFS, deviceOptions, loadDevicePrefs, pickOutputForMode, saveDevicePrefs } from './callDevices'

const outputs = [
  { deviceId: 'hp', label: 'Headphones' },
  { deviceId: 'ear', label: 'Earpiece' },
  { deviceId: 'spk', label: 'Speakerphone' },
]

describe('pickOutputForMode', () => {
  it('finds the loudspeaker, counting "Speakerphone"', () => {
    expect(pickOutputForMode(outputs, 'speaker')).toBe('spk')
  })

  it('finds the earpiece and never mistakes headphones for the phone', () => {
    expect(pickOutputForMode(outputs, 'phone')).toBe('ear')
    expect(pickOutputForMode([{ deviceId: 'hp', label: 'Headphones' }], 'phone')).toBeNull()
  })

  it('leaves the output alone when the phone lists nothing useful', () => {
    expect(pickOutputForMode([], 'speaker')).toBeNull()
  })
})

describe('deviceOptions', () => {
  it('keeps one kind, drops the default aliases and names unlabeled devices', () => {
    const list = [
      { kind: 'audioinput', deviceId: 'default', label: 'Default' },
      { kind: 'audioinput', deviceId: 'a', label: '' },
      { kind: 'audiooutput', deviceId: 'b', label: 'Speakers' },
    ] as MediaDeviceInfo[]
    expect(deviceOptions(list, 'audioinput')).toEqual([{ deviceId: 'a', label: 'Microphone 1' }])
    expect(deviceOptions(list, 'audiooutput')).toEqual([{ deviceId: 'b', label: 'Speakers' }])
  })
})

describe('device prefs', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips through storage', () => {
    saveDevicePrefs({ micId: 'm', speakerId: 's', speakerMode: 'phone' })
    expect(loadDevicePrefs()).toEqual({ micId: 'm', speakerId: 's', speakerMode: 'phone' })
  })

  it('falls back to defaults for missing or broken values', () => {
    expect(loadDevicePrefs()).toEqual(DEFAULT_DEVICE_PREFS)
    localStorage.setItem('call-devices', '{"speakerMode":"loud","micId":3}')
    expect(loadDevicePrefs()).toEqual(DEFAULT_DEVICE_PREFS)
  })
})
