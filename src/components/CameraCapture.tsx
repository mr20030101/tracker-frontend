import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, RotateCw, Upload } from 'lucide-react'

// Saved photos are this wide at most: plenty to recognise someone, and about 20–40 KB as a JPEG.
const PHOTO_WIDTH = 480
const JPEG_QUALITY = 0.75
// A photo picked from a file (only offered when the camera can't open) must be this fresh, the same
// window the server gives an upload to be used.
const MAX_FILE_AGE_MS = 30 * 60 * 1000

type CameraState = { kind: 'starting' } | { kind: 'live' } | { kind: 'taken'; previewUrl: string; mirrored: boolean } | { kind: 'error'; message: string }

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'Your camera is being used by another app. Close it, then try again.'
  return "Your camera couldn't be opened. Please try again."
}

// Scales an image or video frame down to PHOTO_WIDTH and encodes it as the JPEG the server expects.
function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, PHOTO_WIDTH / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
}

/**
 * Takes a photo with the device's camera, live. Only when the camera can't be opened can a photo
 * be picked from a file instead, and it must have been taken in the last 30 minutes. Calls
 * `onChange` with the JPEG once taken, and with null on a retake.
 */
export function CameraCapture({ onChange }: { onChange: (photo: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({ kind: 'starting' })
  const [fileError, setFileError] = useState<string | null>(null)

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
    return stop
  }, [start, stop])

  // Frees the preview's object URL once it's replaced or the camera closes.
  const previewUrl = state.kind === 'taken' ? state.previewUrl : null
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function take() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const blob = await toJpeg(video, video.videoWidth, video.videoHeight)
    if (!blob) return
    stop()
    setState({ kind: 'taken', previewUrl: URL.createObjectURL(blob), mirrored: true })
    onChange(blob)
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    if (Date.now() - file.lastModified > MAX_FILE_AGE_MS) {
      setFileError('That photo is too old. Take a new one now, then choose it.')
      return
    }
    try {
      const image = await createImageBitmap(file)
      const blob = await toJpeg(image, image.width, image.height)
      image.close()
      if (!blob) throw new Error('encode failed')
      setFileError(null)
      setState({ kind: 'taken', previewUrl: URL.createObjectURL(blob), mirrored: false })
      onChange(blob)
    } catch {
      setFileError("That photo couldn't be read. Try a different one.")
    }
  }

  function retake() {
    onChange(null)
    setFileError(null)
    void start()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-900">
        {/* Mirrored like a mirror, which is what people expect from a front camera; the photo itself isn't. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full -scale-x-100 object-cover ${state.kind === 'live' ? '' : 'hidden'}`}
        />
        {state.kind === 'taken' && <img src={state.previewUrl} alt="Your attendance photo" className={`h-full w-full object-cover ${state.mirrored ? '-scale-x-100' : ''}`} />}
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
      </div>
      {state.kind === 'error' && (
        <>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <Upload className="h-4 w-4" />
            Upload a photo instead
            {/* capture opens the camera app directly on phones; elsewhere it's a file picker. */}
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="sr-only"
              onChange={(e) => {
                void pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <p className="text-xs text-gray-500">Use a photo of yourself taken in the last 30 minutes.</p>
          {fileError && <p className="text-xs text-red-600">{fileError}</p>}
        </>
      )}
      {state.kind === 'live' && (
        <button
          type="button"
          onClick={() => void take()}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <Camera className="h-4 w-4" />
          Take photo
        </button>
      )}
      {state.kind === 'taken' && (
        <button
          type="button"
          onClick={retake}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <RotateCcw className="h-4 w-4" />
          Retake
        </button>
      )}
    </div>
  )
}
