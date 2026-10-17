import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw } from 'lucide-react'

// Saved photos are this wide at most: plenty to recognise someone, and about 20–40 KB as a JPEG.
const PHOTO_WIDTH = 480
const JPEG_QUALITY = 0.75

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

/**
 * Takes a photo with the device's camera, live only (no picking a file from the gallery). Calls
 * `onChange` with the JPEG once taken, and with null on a retake.
 */
export function CameraCapture({ onChange }: { onChange: (photo: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({ kind: 'starting' })

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

  function take() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const scale = Math.min(1, PHOTO_WIDTH / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stop()
        setState({ kind: 'taken', previewUrl: URL.createObjectURL(blob) })
        onChange(blob)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  }

  function retake() {
    onChange(null)
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
        {state.kind === 'taken' && <img src={state.previewUrl} alt="Your attendance photo" className="h-full w-full -scale-x-100 object-cover" />}
        {state.kind === 'starting' && <div className="flex h-full items-center justify-center text-sm text-gray-300">Opening camera...</div>}
        {state.kind === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-200">
            {state.message}
            <button type="button" onClick={() => void start()} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">
              Try again
            </button>
          </div>
        )}
      </div>
      {state.kind === 'live' && (
        <button
          type="button"
          onClick={take}
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
