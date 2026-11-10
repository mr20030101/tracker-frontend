import { describe, expect, it } from 'vitest'
import { aspectCrop, coverRect, faceLabel, faceMessage, faceVerdict } from './faceCheck'

const face = (width: number, score = 0.9) => ({ width, height: width, score })
const seen = (label: string, score = 0.8) => ({ label, score })

describe('faceVerdict', () => {
  it('passes a photo with a clear face in front of the camera', () => {
    expect(faceVerdict([face(160)], 480)).toEqual({ kind: 'ok' })
  })

  it('refuses a photo with no face', () => {
    expect(faceVerdict([], 480)).toEqual({ kind: 'none' })
  })

  it('ignores faces the detector is unsure of', () => {
    expect(faceVerdict([face(160, 0.4)], 480)).toEqual({ kind: 'none' })
  })

  it('asks to move closer when the only face is small in the frame', () => {
    expect(faceVerdict([face(30)], 480)).toEqual({ kind: 'far' })
  })

  it('passes when any confident face is large enough, with others in the background', () => {
    expect(faceVerdict([face(20), face(150)], 480)).toEqual({ kind: 'ok' })
  })

  it('refuses an animal even when the face detector fires on it', () => {
    expect(faceVerdict([face(160)], 480, [seen('cat')])).toEqual({ kind: 'animal', animal: 'cat' })
  })

  it('names the most likely animal', () => {
    expect(faceVerdict([], 480, [seen('cat', 0.5), seen('dog', 0.9)])).toEqual({ kind: 'animal', animal: 'dog' })
  })

  it('passes a person holding their pet', () => {
    expect(faceVerdict([face(160)], 480, [seen('dog'), seen('person')])).toEqual({ kind: 'ok' })
  })

  it('ignores an animal the detector is unsure of', () => {
    expect(faceVerdict([face(160)], 480, [seen('dog', 0.2)])).toEqual({ kind: 'ok' })
  })

  it('still needs a face when a person is seen', () => {
    expect(faceVerdict([], 480, [seen('person')])).toEqual({ kind: 'none' })
  })
})

describe('labels', () => {
  it('calls a person human and names an animal', () => {
    expect(faceLabel({ kind: 'ok' })).toBe('Human')
    expect(faceLabel({ kind: 'animal', animal: 'cat' })).toBe('Animal (cat)')
    expect(faceMessage({ kind: 'animal', animal: 'cat' })).toBe('That looks like a cat, not a person. Take a photo of yourself.')
  })
})

describe('coverRect', () => {
  it('maps straight across when the frame already has the preview shape', () => {
    expect(coverRect({ x: 160, y: 120, width: 320, height: 240 }, 640, 480, 4 / 3)).toEqual({ left: 25, top: 25, width: 50, height: 50 })
  })

  it('allows for the sides cut off a wide frame', () => {
    // 16:9 shown in 4:3: the middle 75% of the width shows.
    const rect = coverRect({ x: 480, y: 0, width: 320, height: 360 }, 1280, 720, 4 / 3)
    expect(rect.left).toBeCloseTo(33.33, 1)
    expect(rect.width).toBeCloseTo(33.33, 1)
    expect(rect.top).toBe(0)
    expect(rect.height).toBe(50)
  })

  it('allows for the top and bottom cut off a tall frame', () => {
    // 3:4 shown in 4:3: the middle 56.25% of the height shows.
    const rect = coverRect({ x: 0, y: 480, width: 360, height: 180 }, 720, 960, 4 / 3)
    expect(rect.top).toBeCloseTo(((0.5 - 0.21875) / 0.5625) * 100, 5)
    expect(rect.height).toBeCloseTo((0.1875 / 0.5625) * 100, 5)
    expect(rect.width).toBe(50)
  })
})

describe('babies', () => {
  const face = { width: 200, height: 200, score: 0.9 }
  it('labels a face estimated under 4 years old a baby', () => {
    expect(faceVerdict([face], 480, [], 1.3)).toEqual({ kind: 'baby' })
    expect(faceLabel({ kind: 'baby' })).toBe('Baby')
  })

  it('calls an older face human, as when no age could be estimated', () => {
    expect(faceVerdict([face], 480, [], 4)).toEqual({ kind: 'ok' })
    expect(faceVerdict([face], 480, [], 34)).toEqual({ kind: 'ok' })
    expect(faceVerdict([face], 480, [], null)).toEqual({ kind: 'ok' })
  })
})

describe('aspectCrop', () => {
  it('takes the widest 4:3 area of a tall photo, round the face', () => {
    // 600x1200 portrait, face near the top: a 600x450 slice that keeps the face in the middle.
    expect(aspectCrop(600, 1200, 4 / 3, { x: 300, y: 300 })).toEqual({ x: 0, y: 75, width: 600, height: 450 })
  })

  it('stays inside the photo when the face is near an edge', () => {
    expect(aspectCrop(600, 1200, 4 / 3, { x: 300, y: 50 })).toEqual({ x: 0, y: 0, width: 600, height: 450 })
    expect(aspectCrop(600, 1200, 4 / 3, { x: 300, y: 1190 })).toEqual({ x: 0, y: 750, width: 600, height: 450 })
  })

  it('trims the sides of a wide photo, and centres without a face', () => {
    expect(aspectCrop(1600, 900, 4 / 3)).toEqual({ x: 200, y: 0, width: 1200, height: 900 })
  })
})
