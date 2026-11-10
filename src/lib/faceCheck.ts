// Decides whether an attendance photo shows a person: at least one face, large enough that someone
// is in front of the camera rather than in a poster across the room, and not an animal. It only
// tells a person from an animal; it never says whose face it is, and nothing about it is stored.

export interface FaceBox {
  width: number
  height: number
  score: number
}

export interface SeenObject {
  label: string
  score: number
}

export type FaceVerdict = { kind: 'ok' } | { kind: 'none' } | { kind: 'far' } | { kind: 'animal'; animal: string }

export const MIN_FACE_SCORE = 0.6
// The face's width as a share of the photo's. A selfie at arm's length or a laptop webcam is 0.2–0.5.
export const MIN_FACE_WIDTH_SHARE = 0.08
export const MIN_OBJECT_SCORE = 0.4

// The animals the object detector (COCO classes) knows.
export const ANIMAL_LABELS = ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe']
export const PERSON_LABEL = 'person'

export function faceVerdict(faces: FaceBox[], frameWidth: number, objects: SeenObject[] = []): FaceVerdict {
  const seen = objects.filter((object) => object.score >= MIN_OBJECT_SCORE)
  const animal = seen.filter((object) => ANIMAL_LABELS.includes(object.label)).sort((a, b) => b.score - a.score)[0]
  // A pet beside its owner is fine; only an animal with no person in the photo is refused.
  if (animal && !seen.some((object) => object.label === PERSON_LABEL)) return { kind: 'animal', animal: animal.label }

  const confident = faces.filter((face) => face.score >= MIN_FACE_SCORE)
  if (confident.length === 0) return { kind: 'none' }
  const widest = Math.max(...confident.map((face) => face.width))
  return frameWidth > 0 && widest / frameWidth >= MIN_FACE_WIDTH_SHARE ? { kind: 'ok' } : { kind: 'far' }
}

export function faceMessage(verdict: Exclude<FaceVerdict, { kind: 'ok' }>): string {
  if (verdict.kind === 'animal') return `That looks like a ${verdict.animal}, not a person. Take a photo of yourself.`
  if (verdict.kind === 'far') return 'Move closer so your face fills more of the frame, then try again.'
  return "We can't see a face. Face the camera in good light, then try again."
}

export function faceLabel(verdict: FaceVerdict): string {
  if (verdict.kind === 'ok') return 'Ghost'
  if (verdict.kind === 'animal') return `Animal (${verdict.animal})`
  if (verdict.kind === 'far') return 'Move closer'
  return 'No face in frame'
}

export interface PercentRect {
  left: number
  top: number
  width: number
  height: number
}

// Where a box in the frame's pixels lands, in percent, once the frame is shown with object-cover
// in a preview of the given aspect ratio (the frame is scaled to fill it and centred, the overflow cut).
export function coverRect(
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  previewAspect: number,
): PercentRect {
  const frameAspect = frameWidth / frameHeight
  const shownW = frameAspect > previewAspect ? previewAspect / frameAspect : 1
  const shownH = frameAspect > previewAspect ? 1 : frameAspect / previewAspect
  const x = (box.x / frameWidth - (1 - shownW) / 2) / shownW
  const y = (box.y / frameHeight - (1 - shownH) / 2) / shownH
  return { left: x * 100, top: y * 100, width: (box.width / frameWidth / shownW) * 100, height: (box.height / frameHeight / shownH) * 100 }
}
