import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, RotateCw, Send, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { chatImageToJpeg, MAX_CHAT_IMAGES, uploadChatImage } from '../lib/chatImages'
import { matchCandidates, mentionQueryAt, type MentionCandidate } from '../lib/mentions'
import { Avatar } from './Avatar'
import { EmojiPickerButton } from './EmojiPickerButton'

interface PendingImage {
  key: number
  preview: string
  jpeg: Blob | null
  progress: number
  state: 'uploading' | 'done' | 'error'
  ref?: string
  error?: string
}

export interface ChatSendPayload {
  body: string
  imageRefs: string[]
}

const MAX_TEXTAREA_HEIGHT = 160

/**
 * The message box under a chat: Enter sends (and clears the box), Shift+Enter starts a new line,
 * "@" suggests people to mention, and photos can be attached, pasted or dropped in.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder = 'Aa',
  mentionCandidates = [],
  allowImages = true,
  maxLength = 2000,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  onSend: (payload: ChatSendPayload) => Promise<unknown>
  placeholder?: string
  mentionCandidates?: MentionCandidate[]
  allowImages?: boolean
  maxLength?: number
  className?: string
}) {
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<PendingImage[]>([])
  const imagesRef = useRef(images)
  imagesRef.current = images
  const nextKey = useRef(1)
  const [note, setNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [caret, setCaret] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview)), [])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }, [value])

  const mention = mentionQueryAt(value, caret)
  const suggestions = useMemo(
    () => (mention && dismissedAt !== mention.start ? matchCandidates(mentionCandidates, mention.query) : []),
    [mention?.start, mention?.query, dismissedAt, mentionCandidates], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const showSuggestions = suggestions.length > 0
  useEffect(() => setActiveIndex(0), [mention?.query])

  function pickMention(candidate: MentionCandidate) {
    if (!mention) return
    const insert = `@${candidate.name} `
    const next = value.slice(0, mention.start) + insert + value.slice(caret)
    onChange(next.slice(0, maxLength))
    const pos = mention.start + insert.length
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const patch = (key: number, change: Partial<PendingImage>) => setImages((all) => all.map((img) => (img.key === key ? { ...img, ...change } : img)))

  function upload(key: number, jpeg: Blob) {
    patch(key, { state: 'uploading', progress: 0, error: undefined })
    uploadChatImage(jpeg, (progress) => patch(key, { progress }))
      .then((ref) => patch(key, { state: 'done', progress: 1, ref }))
      .catch((error: unknown) => patch(key, { state: 'error', error: errorMessage(error, "Couldn't upload this photo.") }))
  }

  function addFiles(files: File[]) {
    if (!allowImages) return
    const picked = files.filter((file) => file.type.startsWith('image/'))
    if (files.length && !picked.length) {
      setNote('Only images can be sent here.')
      return
    }
    const room = MAX_CHAT_IMAGES - imagesRef.current.length
    if (picked.length > room) setNote(`Up to ${MAX_CHAT_IMAGES} photos per message.`)
    else setNote(null)
    for (const file of picked.slice(0, Math.max(0, room))) {
      const key = nextKey.current++
      const preview = URL.createObjectURL(file)
      setImages((all) => [...all, { key, preview, jpeg: null, progress: 0, state: 'uploading' }])
      chatImageToJpeg(file)
        .then((jpeg) => {
          patch(key, { jpeg })
          upload(key, jpeg)
        })
        .catch((error: unknown) => patch(key, { state: 'error', error: errorMessage(error, 'That image could not be read.') }))
    }
    textareaRef.current?.focus()
  }

  function removeImage(key: number) {
    setImages((all) => {
      const img = all.find((i) => i.key === key)
      if (img) URL.revokeObjectURL(img.preview)
      return all.filter((i) => i.key !== key)
    })
  }

  function send() {
    const body = value.trim()
    if (images.some((img) => img.state === 'uploading')) {
      setNote('Wait for the photos to finish uploading.')
      return
    }
    if (images.some((img) => img.state === 'error')) {
      setNote('Retry or remove the photo that failed.')
      return
    }
    if (!body && images.length === 0) return
    const sent = images
    const imageRefs = sent.map((img) => img.ref!)
    // The sender's own copy shows straight away from the local file instead of a round trip to Drive.
    for (const img of sent) queryClient.setQueryData(['chat-image', img.ref], img.preview)
    setNote(null)
    setImages([])
    onChange('')
    onSend({ body, imageRefs }).catch(() => {
      for (const img of sent) queryClient.removeQueries({ queryKey: ['chat-image', img.ref] })
      onChange(value)
      setImages(sent)
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSuggestions) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((i) => (i + step + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickMention(suggestions[activeIndex] ?? suggestions[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissedAt(mention?.start ?? null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (allowImages && files.some((file) => file.type.startsWith('image/'))) {
      e.preventDefault()
      addFiles(files)
    }
  }

  function handleDrop(e: DragEvent<HTMLFormElement>) {
    if (!allowImages) return
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const syncCaret = () => setCaret(textareaRef.current?.selectionStart ?? 0)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      onDragOver={(e) => {
        if (!allowImages || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
      className={`relative flex flex-col gap-2 p-3 transition-colors duration-100 ${dragging ? 'bg-accent-bg' : ''} ${className}`}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent text-sm font-semibold text-accent-on-bg">
          Drop photos to send
        </div>
      )}

      {showSuggestions && (
        <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {suggestions.map((c, index) => (
            <li key={c.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickMention(c)
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${index === activeIndex ? 'bg-gray-100' : ''}`}
              >
                <Avatar name={c.name} photoUrl={c.avatar_url} size={24} />
                <span className="truncate text-gray-800">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.key} className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-50" title={img.error}>
              <img src={img.preview} alt="" className={`h-full w-full object-cover ${img.state === 'done' ? '' : 'opacity-60'}`} />
              {img.state === 'uploading' && (
                <div className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${Math.round(img.progress * 100)}%` }} />
                </div>
              )}
              {img.state === 'error' && (
                <button
                  type="button"
                  onClick={() => (img.jpeg ? upload(img.key, img.jpeg) : removeImage(img.key))}
                  aria-label="Retry upload"
                  className="absolute inset-0 flex items-center justify-center bg-status-danger-bg/80 text-status-danger-text"
                >
                  <RotateCw className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeImage(img.key)}
                aria-label="Remove photo"
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/70 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {note && (
        <div role="status" className="text-xs text-status-danger-text">
          {note}
        </div>
      )}

      <div className="flex items-end gap-2">
        {allowImages && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add a photo"
              title="Add a photo (or paste / drop one)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart)
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onSelect={syncCaret}
          onBlur={() => setDismissedAt(mention?.start ?? null)}
          onFocus={() => setDismissedAt(null)}
          onPaste={handlePaste}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label="Message"
          className="min-h-9 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm leading-5 outline-none focus:border-accent"
        />
        <EmojiPickerButton onSelect={(emoji) => onChange(value + emoji)} />
        <button
          type="submit"
          disabled={!value.trim() && images.length === 0}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors duration-100 hover:bg-accent-hover disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
          Send
        </button>
      </div>
    </form>
  )
}
