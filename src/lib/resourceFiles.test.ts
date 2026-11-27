import { describe, expect, it } from 'vitest'
import { resourceFileFolder, resourceFolder, storageSafeName } from './resourceFiles'

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

describe('resourceFolder', () => {
  it('puts a general resource in general/', () => {
    expect(resourceFolder(null, null)).toBe('general')
  })

  it("puts a project's resource in its project folder", () => {
    expect(resourceFolder(12, null)).toBe('12')
  })

  it("puts one team's resource under its lead, inside the project folder", () => {
    expect(resourceFolder(12, 'b3c1e0a2-1111-4222-8333-444455556666')).toBe('12/b3c1e0a2-1111-4222-8333-444455556666')
  })
})

describe('resourceFileFolder', () => {
  it('reads the folder back from a path', () => {
    expect(resourceFileFolder('12/abc-guide.mp4')).toBe('12')
    expect(resourceFileFolder('12/b3c1e0a2-1111-4222-8333-444455556666/abc-guide.mp4')).toBe('12/b3c1e0a2-1111-4222-8333-444455556666')
    expect(resourceFileFolder('general/abc-guide.mp4')).toBe('general')
  })

  it('is null for a file at the top of the bucket', () => {
    expect(resourceFileFolder('abc-guide.mp4')).toBeNull()
  })
})
