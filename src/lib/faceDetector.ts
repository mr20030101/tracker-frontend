import type { FaceDetector, ObjectDetector } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import faceModelUrl from '../assets/models/blaze_face_short_range.tflite?url'
import objectModelUrl from '../assets/models/efficientdet_lite0.tflite?url'
import { ANIMAL_LABELS, faceVerdict, MIN_FACE_SCORE, MIN_OBJECT_SCORE, PERSON_LABEL, type FaceVerdict } from './faceCheck'

export interface Detectors {
  face: FaceDetector
  // Tells a person from an animal. Null if only it failed to load: the face check still runs.
  objects: ObjectDetector | null
}

// Loaded once, the first time the attendance camera opens; MediaPipe and its models run on the
// device, so the photo isn't sent anywhere to be checked. Resolves to null when this browser can't
// run it: the photo is then taken without the check rather than blocking attendance.
let detectorsPromise: Promise<Detectors | null> | null = null

export function loadFaceDetector(): Promise<Detectors | null> {
  detectorsPromise ??= import('@mediapipe/tasks-vision')
    .then(async ({ FaceDetector, ObjectDetector }) => {
      const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl }
      const [face, objects] = await Promise.all([
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: faceModelUrl, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: MIN_FACE_SCORE,
        }),
        ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: objectModelUrl, delegate: 'CPU' },
          runningMode: 'IMAGE',
          scoreThreshold: MIN_OBJECT_SCORE,
          maxResults: 5,
          categoryAllowlist: [PERSON_LABEL, ...ANIMAL_LABELS],
        }).catch((error) => {
          console.warn('Person/animal check unavailable:', error)
          return null
        }),
      ])
      return { face, objects }
    })
    .catch((error) => {
      console.warn('Face check unavailable:', error)
      return null
    })
  return detectorsPromise
}

export interface SeenBox {
  kind: 'face' | 'animal'
  x: number
  y: number
  width: number
  height: number
}

export interface FrameCheck {
  verdict: FaceVerdict
  // In the frame's own pixels, to draw over it.
  boxes: SeenBox[]
  width: number
  height: number
}

const toBox = (kind: SeenBox['kind'], box: { originX: number; originY: number; width: number; height: number }): SeenBox => ({
  kind,
  x: box.originX,
  y: box.originY,
  width: box.width,
  height: box.height,
})

export function checkFrame(detectors: Detectors, source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap): FrameCheck {
  const isVideo = source instanceof HTMLVideoElement
  const width = isVideo ? source.videoWidth : source.width
  const height = isVideo ? source.videoHeight : source.height
  const faceHits = detectors.face.detect(source).detections
  const objectHits = detectors.objects?.detect(source).detections ?? []
  const faces = faceHits.map((detection) => ({
    width: detection.boundingBox?.width ?? 0,
    height: detection.boundingBox?.height ?? 0,
    score: detection.categories[0]?.score ?? 0,
  }))
  const objects = objectHits.map((detection) => ({
    label: detection.categories[0]?.categoryName ?? '',
    score: detection.categories[0]?.score ?? 0,
  }))
  const verdict = faceVerdict(faces, width, objects)
  const boxes =
    verdict.kind === 'animal'
      ? objectHits.filter((d) => d.boundingBox && d.categories[0]?.categoryName !== PERSON_LABEL).map((d) => toBox('animal', d.boundingBox!))
      : faceHits.filter((d) => d.boundingBox).map((d) => toBox('face', d.boundingBox!))
  return { verdict, boxes, width, height }
}
