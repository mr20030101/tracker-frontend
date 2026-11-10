import type { FaceDetector, ObjectDetector } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import faceModelUrl from '../assets/models/blaze_face_short_range.tflite?url'
import objectModelUrl from '../assets/models/efficientdet_lite0.tflite?url'
import ageModelUrl from '../assets/models/age_gender_model.bin?url'
import ageManifestUrl from '../assets/models/age_gender_model-manifest.json?url'
import { ANIMAL_LABELS, faceVerdict, MIN_FACE_SCORE, MIN_OBJECT_SCORE, PERSON_LABEL, type FaceVerdict } from './faceCheck'

export interface Detectors {
  face: FaceDetector
  // Tells a person from an animal. Null if only it failed to load: the face check still runs.
  objects: ObjectDetector | null
  // Estimates the age of a face cropped from the frame, to tell a baby from the contributor. Null if
  // it failed to load: the rest of the check still runs.
  age: ((face: HTMLCanvasElement) => Promise<number>) | null
}

// The age model (face-api's AgeGenderNet on TensorFlow.js, WebGL or else CPU). Its weights load
// from the bundled files rather than its own model folder, since the build renames them.
async function loadAgeModel(): Promise<Detectors['age']> {
  const faceapi = await import('@vladmandic/face-api')
  // The bundled TensorFlow.js has these; face-api's types leave them out.
  const tf = faceapi.tf as typeof faceapi.tf & { setBackend: (name: string) => Promise<boolean>; ready: () => Promise<void> }
  if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu')
  await tf.ready()
  const [manifest, weights] = await Promise.all([
    fetch(ageManifestUrl).then((r) => r.json() as Promise<{ weights: Parameters<typeof faceapi.tf.io.decodeWeights>[1] }[]>),
    fetch(ageModelUrl).then((r) => r.arrayBuffer()),
  ])
  faceapi.nets.ageGenderNet.loadFromWeightMap(faceapi.tf.io.decodeWeights(weights, manifest[0].weights))
  return async (face) => {
    const result = await faceapi.nets.ageGenderNet.predictAgeAndGender(face)
    return (Array.isArray(result) ? result[0] : result).age
  }
}

// Loaded once, the first time the attendance camera opens; MediaPipe and its models run on the
// device, so the photo isn't sent anywhere to be checked. Resolves to null when this browser can't
// run it: the photo is then taken without the check rather than blocking attendance.
let detectorsPromise: Promise<Detectors | null> | null = null

export function loadFaceDetector(): Promise<Detectors | null> {
  detectorsPromise ??= import('@mediapipe/tasks-vision')
    .then(async ({ FaceDetector, ObjectDetector }) => {
      const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl }
      const [face, objects, age] = await Promise.all([
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
        loadAgeModel().catch((error) => {
          console.warn('Baby check unavailable:', error)
          return null
        }),
      ])
      return { face, objects, age }
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

/** The centre of the largest face in the picture, or null when there's none. */
export function mainFaceCenter(detectors: Detectors, source: HTMLCanvasElement | ImageBitmap): { x: number; y: number } | null {
  const box = detectors.face
    .detect(source)
    .detections.map((d) => d.boundingBox)
    .reduce<{ originX: number; originY: number; width: number; height: number } | null>(
      (a, b) => (b && (!a || b.width * b.height > a.width * a.height) ? b : a),
      null,
    )
  return box ? { x: box.originX + box.width / 2, y: box.originY + box.height / 2 } : null
}

// The face cut out of the frame with some margin round it, as the age model expects.
function cropFace(source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap, box: SeenBox, width: number, height: number): HTMLCanvasElement {
  const margin = Math.max(box.width, box.height) * 0.25
  const x = Math.max(0, box.x - margin)
  const y = Math.max(0, box.y - margin)
  const w = Math.min(width - x, box.width + margin * 2)
  const h = Math.min(height - y, box.height + margin * 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  canvas.getContext('2d')?.drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height)
  return canvas
}

export async function checkFrame(detectors: Detectors, source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap): Promise<FrameCheck> {
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
  let verdict = faceVerdict(faces, width, objects)
  // A face that passes is checked for being a baby's, by the largest face's estimated age.
  if (verdict.kind === 'ok' && detectors.age) {
    const main = faceHits
      .filter((d) => d.boundingBox)
      .map((d) => toBox('face', d.boundingBox!))
      .reduce<SeenBox | null>((a, b) => (!a || b.width * b.height > a.width * a.height ? b : a), null)
    if (main) {
      const age = await detectors.age(cropFace(source, main, width, height)).catch(() => null)
      verdict = faceVerdict(faces, width, objects, age)
    }
  }
  const boxes =
    verdict.kind === 'animal'
      ? objectHits.filter((d) => d.boundingBox && d.categories[0]?.categoryName !== PERSON_LABEL).map((d) => toBox('animal', d.boundingBox!))
      : faceHits.filter((d) => d.boundingBox).map((d) => toBox('face', d.boundingBox!))
  return { verdict, boxes, width, height }
}
