import { describe, expect, it } from 'vitest'
import { storageSafeName } from './resourceFiles'

describe('storageSafeName', () => {
  it('replaces the narrow no-break space in a macOS screen recording name', () => {
    expect(storageSafeName('Screen Recording 2026-11-25 at 10.32.11 AM.mov')).toBe('Screen-Recording-2026-11-25-at-10.32.11-AM.mov')
  })

  it('drops accents and unsafe characters, keeping the extension', () => {
    expect(storageSafeName('Résumé [final] #2?.PNG')).toBe('Resume-final-2.PNG')
  })

  it('never returns an empty name', () => {
    expect(storageSafeName('###.mp4')).toBe('file.mp4')
    expect(storageSafeName('')).toBe('file')
  })

  it('leaves an already safe name alone', () => {
    expect(storageSafeName('guide_v2.mp4')).toBe('guide_v2.mp4')
  })
})
