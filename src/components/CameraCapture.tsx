import { useCallback, useEffect, useRef, useState } from 'react'
import { Baby, Camera, Loader2, PawPrint, RotateCcw, RotateCw, ScanFace, Upload, User } from 'lucide-react'
import { aspectCrop, boxLabel, coverRect, faceLabel, faceMessage, frameSummary } from '../lib/faceCheck'
import { checkFrame, loadFaceDetector, mainFaceCenter, type FrameCheck, type SeenBox } from '../lib/faceDetector'

// Saved photos are this wide at most: plenty to recognise someone, and about 20–40 KB as a JPEG.
const PHOTO_WIDTH = 480
const JPEG_QUALITY = 0.75
const LIVE_CHECK_MS = 500
// The preview's shape (aspect-[4/3]), which uploaded photos are cropped to too; boxes are mapped onto
// it as object-cover crops the video.
const PREVIEW_ASPECT = 4 / 3

type CameraState = { kind: 'starting' } | { kind: 'live' } | { kind: 'taken'; previewUrl: string } | { kind: 'error'; message: string }

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'Your camera is being used by another app. Close it, then try again.'
  return "Your camera couldn't be opened. Please try again."
}

// Scales an image or video frame down to PHOTO_WIDTH, the size the server expects.
function scaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, PHOTO_WIDTH / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

// An uploaded photo, cut to the camera's 4:3 shape round the face in it (or its middle, without one)
// and scaled like a camera shot, so both kinds of photo come out the same.
async function cropLikeCamera(image: ImageBitmap): Promise<HTMLCanvasElement> {
  const detectors = await loadFaceDetector()
  // Faces are found on a copy at most 960 wide: quick, and plenty for a face's position.
  const look = Math.min(1, 960 / image.width)
  const small = document.createElement('canvas')
  small.width = Math.round(image.width * look)
  small.height = Math.round(image.height * look)
  small.getContext('2d')?.drawImage(image, 0, 0, small.width, small.height)
  const center = detectors ? mainFaceCenter(detectors, small) : null
  const crop = aspectCrop(image.width, image.height, PREVIEW_ASPECT, center && { x: center.x / look, y: center.y / look })
  const width = Math.min(PHOTO_WIDTH, Math.round(crop.width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round(width / PREVIEW_ASPECT)
  canvas.getContext('2d')?.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
  return canvas
}

const toJpeg = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))

const FACE_COLOUR = '#34d399'
const ANIMAL_COLOUR = '#fbbf24'
const FACE_TAG = 'rgba(5, 150, 105, 0.9)'
const ANIMAL_TAG = 'rgba(217, 119, 6, 0.9)'
const SUMMARY_TAG = 'rgba(17, 24, 39, 0.7)'
const PERSON_ICON = ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0']
const BABY_ICON = [
  'M9 12h.01',
  'M15 12h.01',
  'M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5',
  'M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1',
]

// A rounded label with an optional lucide icon (drawn on its 24px grid), its top-left at x, y.
function drawTag(g: CanvasRenderingContext2D, x: number, y: number, size: number, text: string, fill: string, icon: string[] | null) {
  const { width, height } = tagSize(g, size, text, icon)
  const padX = Math.round(size * 0.6)
  const iconSize = Math.round(size * 1.05)
  g.fillStyle = fill
  g.beginPath()
  g.roundRect(x, y, width, height, Math.round(size * 0.4))
  g.fill()
  if (icon) {
    g.save()
    g.translate(x + padX, y + (height - iconSize) / 2)
    g.scale(iconSize / 24, iconSize / 24)
    g.strokeStyle = '#fff'
    g.lineWidth = 2
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const d of icon) g.stroke(new Path2D(d))
    g.restore()
  }
  g.fillStyle = '#fff'
  g.textBaseline = 'middle'
  g.fillText(text, x + padX + (icon ? iconSize + Math.round(size * 0.35) : 0), y + height / 2)
}

function tagSize(g: CanvasRenderingContext2D, size: number, text: string, icon: string[] | null) {
  const iconW = icon ? Math.round(size * 1.05) + Math.round(size * 0.35) : 0
  return { width: g.measureText(text).width + Math.round(size * 0.6) * 2 + iconW, height: Math.round(size * 1.7) }
}

// Draws every box with its own label into the photo itself, as they looked on the live view, and
// the count in the corner when there's more than one.
function markFaces(canvas: HTMLCanvasElement, check: FrameCheck) {
  const g = canvas.getContext('2d')
  if (!g || check.boxes.length === 0) return
  const line = Math.max(2, Math.round(canvas.width / 160))
  const size = Math.max(12, Math.round(canvas.width / 32))
  g.font = `600 ${size}px system-ui, sans-serif`
  g.lineWidth = line
  for (const box of check.boxes) {
    g.strokeStyle = box.kind === 'animal' ? ANIMAL_COLOUR : FACE_COLOUR
    g.strokeRect(box.x, box.y, box.width, box.height)
  }
  for (const box of check.boxes) {
    const icon = box.kind === 'animal' ? null : box.label === 'baby' ? BABY_ICON : PERSON_ICON
    const text = boxLabel(box.label)
    const tag = tagSize(g, size, text, icon)
    const x = Math.min(canvas.width - tag.width, Math.max(0, box.x + box.width / 2 - tag.width / 2))
    // Above the box, or just inside its top edge when there's no room.
    const y = box.y - tag.height - line >= 0 ? box.y - tag.height - line : Math.max(0, box.y) + line
    drawTag(g, x, y, size, text, box.kind === 'animal' ? ANIMAL_TAG : FACE_TAG, icon)
  }
  if (check.boxes.length > 1) drawTag(g, line * 2, line * 2, size, frameSummary(check.boxes.map((b) => b.label)), SUMMARY_TAG, null)
}

// Checks the photo for a face and, when it passes, marks it. Null when it passes, or when the
// check can't run on this device, so the photo is taken without it.
async function checkAndMarkFace(canvas: HTMLCanvasElement): Promise<string | null> {
  const detector = await loadFaceDetector()
  if (!detector) return null
  const check = await checkFrame(detector, canvas)
  // A baby is accepted too, just labelled as one.
  if (check.verdict.kind !== 'ok' && check.verdict.kind !== 'baby') return faceMessage(check.verdict)
  markFaces(canvas, check)
  return null
}

// One face or animal on the live view: its box, and its label riding above it (or just inside the
// preview's top edge when there's no room above, so it never goes off-screen with the crop).
function LiveBox({ box, rect, dim }: { box: SeenBox; rect: ReturnType<typeof coverRect>; dim: boolean }) {
  const animal = box.kind === 'animal'
  const Icon = animal ? PawPrint : box.label === 'baby' ? Baby : User
  const roomAbove = rect.top >= 12
  return (
    <>
      <div
        className={`pointer-events-none absolute rounded border-[3px] transition-all duration-150 ${
          animal ? 'border-amber-400' : dim ? 'border-white/70' : 'border-emerald-400'
        }`}
        style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
      />
      <div
        className={`pointer-events-none absolute -translate-x-1/2 transition-all duration-150 ${roomAbove ? '-translate-y-full pb-1' : 'pt-1'}`}
        style={{ left: `${Math.min(85, Math.max(15, rect.left + rect.width / 2))}%`, top: `${Math.max(0, rect.top)}%` }}
      >
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-white ${
            animal ? 'bg-amber-600/90' : dim ? 'bg-gray-900/70' : 'bg-emerald-600/90'
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {boxLabel(box.label)}
        </span>
      </div>
    </>
  )
}

/**
 * Takes a photo with the device's camera, live, or uses one uploaded from the device (any photo:
 * its file date isn't checked). Either way the photo must show a person's face, not an animal
 * (checked on the device; see faceDetector.ts). Calls
 * `onChange` with the JPEG once taken, and with null on a retake.
 */
export function CameraCapture({ onChange }: { onChange: (photo: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({ kind: 'starting' })
  const [fileError, setFileError] = useState<string | null>(null)
  const [faceError, setFaceError] = useState<string | null>(null)
  const [liveCheck, setLiveCheck] = useState<FrameCheck | null>(null)
  const liveFace = liveCheck?.verdict ?? null
  const [checking, setChecking] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    setState({ kind: 'starting' })
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: 'error', message: "This browser can't open the camera. Try Chrome or Safari." })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setState({ kind: 'live' })
    } catch (error) {
      setState({ kind: 'error', message: cameraError(error) })
    }
  }, [])

  useEffect(() => {
    void start()
    void loadFaceDetector()
    return stop
  }, [start, stop])

  const live = state.kind === 'live'
  useEffect(() => {
    if (!live) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const detector = await loadFaceDetector()
      const video = videoRef.current
      if (cancelled || !detector) return
      if (video?.videoWidth) {
        const check = await checkFrame(detector, video).catch(() => null)
        if (cancelled) return
        if (check) setLiveCheck(check)
      }
      timer = setTimeout(tick, LIVE_CHECK_MS)
    }
    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
      setLiveCheck(null)
    }
  }, [live])

  // Frees the preview's object URL once it's replaced or the camera closes.
  const previewUrl = state.kind === 'taken' ? state.previewUrl : null
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function take() {
    const video = videoRef.current
    if (checking || !video || !video.videoWidth) return
    setChecking(true)
    const canvas = scaled(video, video.videoWidth, video.videoHeight)
    const problem = await checkAndMarkFace(canvas)
    const blob = problem ? null : await toJpeg(canvas)
    setChecking(false)
    setFaceError(problem)
    if (!blob) return
    stop()
    setState({ kind: 'taken', previewUrl: URL.createObjectURL(blob) })
    onChange(blob)
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    try {
      const image = await createImageBitmap(file)
      const canvas = await cropLikeCamera(image)
      image.close()
      const problem = await checkAndMarkFace(canvas)
      if (problem) {
        setFileError(problem)
        return
      }
      const blob = await toJpeg(canvas)
      if (!blob) throw new Error('encode failed')
      stop()
      setFileError(null)
      setFaceError(null)
      setState({ kind: 'taken', previewUrl: URL.createObjectURL(blob) })
      onChange(blob)
    } catch {
      setFileError("That photo couldn't be read. Try a different one.")
    }
  }

  function retake() {
    onChange(null)
    setFileError(null)
    setFaceError(null)
    void start()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="group relative aspect-4/3 w-full overflow-hidden rounded-lg bg-gray-900">
        {/* Not mirrored: the live view, the taken photo and the saved photo all face the same way. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${state.kind === 'live' ? '' : 'hidden'}`}
        />
        {live && liveFace && (() => {
          const boxes = liveCheck?.boxes ?? []
          const passing = liveFace.kind === 'ok' || liveFace.kind === 'baby'
          // The corner tag: what's wrong when the check fails, the count when there's more than one.
          const corner =
            liveFace.kind === 'none' || liveFace.kind === 'far' || boxes.length === 0
              ? faceLabel(liveFace)
              : boxes.length > 1
                ? frameSummary(boxes.map((b) => b.label))
                : null
          return (
            <>
              {liveCheck &&
                boxes.map((box, i) => {
                  const rect = coverRect(box, liveCheck.width, liveCheck.height, PREVIEW_ASPECT)
                  return <LiveBox key={i} box={box} rect={rect} dim={box.kind === 'face' && !passing} />
                })}
              {corner && (
                <span className="absolute left-2 top-2 inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md bg-gray-900/70 px-2 text-xs font-semibold text-white">
                  {boxes.length === 0 && <ScanFace className="h-3.5 w-3.5" aria-hidden />}
                  {corner}
                </span>
              )}
            </>
          )
        })()}
        {state.kind === 'taken' && <img src={state.previewUrl} alt="Your attendance photo" className="h-full w-full object-cover" />}
        {state.kind === 'starting' && <div className="flex h-full items-center justify-center text-sm text-gray-300">Opening camera...</div>}
        {state.kind === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-200">
            {state.message}
            <button type="button" onClick={() => void start()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          </div>
        )}
        {(state.kind === 'live' || state.kind === 'starting') && (
          <label
            aria-label="Upload a photo instead"
            title="Upload a photo instead"
            className="absolute right-2 top-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur-sm transition-opacity duration-100 hover:bg-black/70 focus-within:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Upload
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                void pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        )}
        {/* A camera's shutter: the one main action, on the picture itself. */}
        {live && (
          <button
            type="button"
            onClick={() => void take()}
            aria-label={checking ? 'Checking photo' : 'Take photo'}
            aria-busy={checking}
            className="absolute bottom-3 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg ring-4 ring-white/40 transition-transform duration-100 hover:scale-105 active:scale-95"
          >
            {checking ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <Camera className="h-6 w-6" aria-hidden />}
          </button>
        )}
        {state.kind === 'taken' && (
          <button
            type="button"
            onClick={retake}
            className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-4 text-sm font-semibold text-white backdrop-blur-sm hover:bg-black/70"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Retake
          </button>
        )}
      </div>
      {live && faceError && (
        <p role="alert" className="text-xs text-red-600">
          {faceError}
        </p>
      )}
      {state.kind === 'error' && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <Upload className="h-4 w-4" aria-hidden />
          Upload a photo instead
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      )}
      {fileError && <p className="text-xs text-red-600">{fileError}</p>}
    </div>
  )
}
