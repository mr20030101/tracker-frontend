import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { useChatImage } from '../lib/chatImages'

/** The photos on a chat message; tap one to see it full size. */
export function ChatImages({ refs, mine }: { refs: string[]; mine: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  if (refs.length === 0) return null
  return (
    <>
      <div className={`grid max-w-xs gap-1 ${refs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} ${mine ? 'justify-items-end' : ''}`}>
        {refs.map((ref) => (
          <ChatImageThumb key={ref} refId={ref} single={refs.length === 1} onOpen={setOpen} />
        ))}
      </div>
      {open && <Lightbox url={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function ChatImageThumb({ refId, single, onOpen }: { refId: string; single: boolean; onOpen: (url: string) => void }) {
  const { data: url, error } = useChatImage(refId)
  const box = single ? 'max-h-72 w-full' : 'aspect-square w-full'
  if (error) {
    return (
      <div className={`${single ? 'h-32 w-48' : 'aspect-square w-full'} flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 p-2 text-center text-xs text-gray-400`}>
        <ImageOff className="h-4 w-4" aria-hidden />
        {errorMessage(error, "Couldn't load")}
      </div>
    )
  }
  if (!url) return <div className={`${single ? 'h-48 w-48' : 'aspect-square w-full'} animate-pulse rounded-xl bg-gray-100`} />
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(url) }} className="block overflow-hidden rounded-xl border border-gray-200">
      <img src={url} alt="Photo" className={`${box} object-cover`} />
    </button>
  )
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div role="dialog" aria-label="Photo" onClick={onClose} className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 p-4">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10">
        <X className="h-6 w-6" />
      </button>
      <img src={url} alt="Photo" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded object-contain" />
    </div>,
    document.body,
  )
}
