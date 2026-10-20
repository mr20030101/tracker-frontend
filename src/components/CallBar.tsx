import { useEffect, useRef, useState } from 'react'
import { ChevronUp, Mic, MicOff, Phone, PhoneOff, Settings2, X } from 'lucide-react'
import { useCall, type CallPeer, type CallPhase } from '../lib/call'
import { useReducedMotion } from '../lib/motion'
import { useAudioLevel } from '../lib/useAudioLevel'
import { Avatar } from './Avatar'
import { CallSettings } from './CallSettings'

function duration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CallTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <>{duration(now - since)}</>
}

// The floating call card: ringing (either way), connecting, on a call, or why the last call ended.
// Tap the name to open the full view; the gear opens mic and speaker settings.
export function CallBar() {
  const { phase, peer, startedAt, notice, muted, localStream, remoteStream, accept, decline, hangUp, toggleMute, dismissNotice } = useCall()
  const reduced = useReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const drag = useDraggable(card)
  // Their voice moves the rings and bars; yours lights the mute button and the settings meter.
  useAudioLevel(reduced ? null : remoteStream, card, '--peer')
  useAudioLevel(localStream, card, '--mic')

  useEffect(() => {
    if (!notice || phase !== 'idle') return
    const timer = setTimeout(dismissNotice, 5000)
    return () => clearTimeout(timer)
  }, [notice, phase, dismissNotice])

  // Each call starts as the compact card.
  if (phase === 'idle' && (expanded || settingsOpen)) {
    setExpanded(false)
    setSettingsOpen(false)
  }

  if (phase === 'idle') {
    if (!notice) return null
    return (
      <div role="status" className="call-card-in fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
        <PhoneOff className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1">{notice}</span>
        <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
  if (!peer) return null

  const incoming = phase === 'incoming'
  const big = expanded && !incoming
  const status = incoming ? 'is calling you...' : phase === 'outgoing' ? 'Calling...' : phase === 'connecting' ? 'Connecting...' : null
  const subline = (
    <span className="inline-flex items-center gap-2 text-xs text-gray-500">
      {phase === 'active' && <VoiceBars />}
      {status ?? (startedAt ? <CallTimer since={startedAt} /> : null)}
      {phase === 'active' && muted && <span className="text-status-danger-text">· Muted</span>}
    </span>
  )

  const controls = incoming ? (
    <>
      <RoundButton label="Decline" onClick={decline} big={big} className="bg-status-danger-text text-white hover:rotate-[135deg]">
        <PhoneOff className="h-4 w-4" />
      </RoundButton>
      <RoundButton label="Accept" onClick={accept} big={big} className="call-accept-bounce bg-status-success-text text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-status-success-text)_25%,transparent)]">
        <Phone className="h-4 w-4" />
      </RoundButton>
    </>
  ) : (
    <>
      <RoundButton
        label="Call settings"
        onClick={() => setSettingsOpen((o) => !o)}
        pressed={settingsOpen}
        big={big}
        className={settingsOpen ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}
      >
        <Settings2 className={`h-4 w-4 transition-transform duration-500 ${settingsOpen ? 'rotate-180' : ''}`} />
      </RoundButton>
      {phase === 'active' && (
        <RoundButton
          label={muted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
          pressed={muted}
          big={big}
          className={muted ? 'bg-status-danger-bg text-status-danger-text' : 'call-mic-glow bg-gray-100 text-gray-700'}
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </RoundButton>
      )}
      <RoundButton
        label={phase === 'outgoing' ? 'Cancel call' : 'Hang up'}
        onClick={hangUp}
        big={big}
        className="bg-status-danger-text text-white hover:rotate-[135deg]"
      >
        <PhoneOff className="h-4 w-4" />
      </RoundButton>
    </>
  )

  return (
    <div
      ref={card}
      {...drag.handlers}
      style={drag.style}
      role={incoming ? 'alertdialog' : 'status'}
      aria-label={incoming ? `Incoming call from ${peer.name}` : `Call with ${peer.name}`}
      className={`call-card-in fixed inset-x-3 top-3 z-[70] mx-auto max-w-sm touch-none select-none overflow-hidden rounded-2xl border border-gray-200 bg-white ${
        drag.dragging ? 'cursor-grabbing shadow-2xl' : 'cursor-grab shadow-xl'
      }`}
    >
      {/* A soft glow behind the card that swells as they talk. */}
      {phase === 'active' && (
        <div aria-hidden className="call-aura pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-status-success-text/20 blur-2xl" />
      )}
      {big ? (
        <div className="relative flex flex-col items-center gap-3 px-4 pb-5 pt-6">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Minimise call"
            className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <PeerAvatar peer={peer} phase={phase} size={88} />
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{peer.name}</div>
            {subline}
          </div>
          <div className="flex gap-4">{controls}</div>
        </div>
      ) : (
        <div className="relative flex items-center gap-3 px-4 py-3">
          <PeerAvatar peer={peer} phase={phase} size={40} />
          <button
            type="button"
            onClick={() => !incoming && setExpanded(true)}
            disabled={incoming}
            aria-label={incoming ? undefined : 'Open the call'}
            className="min-w-0 flex-1 text-left disabled:cursor-default"
          >
            <div className="truncate text-sm font-semibold text-gray-900">{peer.name}</div>
            {subline}
          </button>
          <div className="flex shrink-0 gap-2">{controls}</div>
        </div>
      )}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${settingsOpen && !incoming ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">{settingsOpen && !incoming && <CallSettings />}</div>
      </div>
    </div>
  )
}

// Edge kept clear of the window when the card is dragged.
const DRAG_MARGIN = 8
// How far the pointer moves before a press becomes a drag, so taps on the buttons still work.
const DRAG_THRESHOLD = 5

// Lets the call card be dragged anywhere on screen (mouse or touch), never off it. Uses the
// `translate` property, so it doesn't fight the card's entrance animation, which uses `transform`.
// Double-click an empty spot to send it back to the top.
function useDraggable(ref: React.RefObject<HTMLDivElement | null>) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const press = useRef<{ id: number; x: number; y: number; base: { x: number; y: number }; rect: DOMRect; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  // The offset that puts a card at `rect` (measured at `base`) inside the window.
  const clamp = (rect: DOMRect, base: { x: number; y: number }, dx: number, dy: number) => {
    const maxLeft = Math.max(DRAG_MARGIN, window.innerWidth - rect.width - DRAG_MARGIN)
    const maxTop = Math.max(DRAG_MARGIN, window.innerHeight - rect.height - DRAG_MARGIN)
    const left = Math.min(maxLeft, Math.max(DRAG_MARGIN, rect.left + dx))
    const top = Math.min(maxTop, Math.max(DRAG_MARGIN, rect.top + dy))
    return { x: base.x + left - rect.left, y: base.y + top - rect.top }
  }

  // Opening the full view or the settings, or shrinking the window, can push it off screen.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      if (press.current?.moved) return
      const next = clamp(el.getBoundingClientRect(), offsetRef.current, 0, 0)
      if (next.x !== offsetRef.current.x || next.y !== offsetRef.current.y) setOffset(next)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    window.addEventListener('resize', fit)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fit)
    }
  })

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      // React bubbles events from the settings' dropdown lists (portals) up to here too.
      if (e.button !== 0 || !ref.current?.contains(e.target as Node)) return
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: offsetRef.current, rect: ref.current.getBoundingClientRect(), moved: false }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const p = press.current
      if (!p || p.id !== e.pointerId) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      if (!p.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        p.moved = true
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }
      setOffset(clamp(p.rect, p.base, dx, dy))
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const p = press.current
      if (!p || p.id !== e.pointerId) return
      press.current = null
      if (p.moved) {
        justDragged.current = true
        setDragging(false)
        // A click only follows on some browsers; clear the flag either way.
        setTimeout(() => (justDragged.current = false), 0)
      }
    },
    onPointerCancel: () => {
      press.current = null
      setDragging(false)
    },
    // The release at the end of a drag isn't a tap on whatever button it ended over.
    onClickCapture: (e: React.MouseEvent) => {
      if (!justDragged.current) return
      justDragged.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    onDoubleClick: (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (!ref.current?.contains(target) || target.closest('button')) return
      setOffset({ x: 0, y: 0 })
    },
  }

  const style: React.CSSProperties = {
    translate: `${offset.x}px ${offset.y}px`,
    transition: dragging ? 'none' : 'translate 300ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
  }
  return { handlers, style, dragging }
}

// Five bars that dance with their voice.
function VoiceBars() {
  const gains = [0.6, 1, 1.4, 0.9, 0.5]
  return (
    <span aria-hidden className="flex h-3 items-center gap-[2px]">
      {gains.map((gain, i) => (
        <span key={i} className="h-full w-[3px] rounded-full bg-status-success-text/15">
          <span
            className="call-bar block h-full w-full rounded-full bg-status-success-text"
            style={{ '--gain': gain } as React.CSSProperties}
          />
        </span>
      ))}
    </span>
  )
}

// Sonar rings while it rings, a spinning arc while it connects, a voice-driven halo on the call.
function PeerAvatar({ peer, phase, size }: { peer: CallPeer; phase: CallPhase; size: number }) {
  const ringing = phase === 'incoming' || phase === 'outgoing'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {ringing &&
        [0, 0.6, 1.2].map((delay) => (
          <span
            key={delay}
            aria-hidden
            className={`call-sonar absolute inset-0 rounded-full border-2 ${phase === 'incoming' ? 'border-status-success-text' : 'border-accent'}`}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      {phase === 'connecting' && (
        <span
          aria-hidden
          className="call-orbit absolute -inset-1 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0 65%, var(--color-accent) 100%)',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
          }}
        />
      )}
      {phase === 'active' && (
        <span aria-hidden className="call-aura absolute inset-0 rounded-full bg-status-success-text/30" />
      )}
      <div className={`relative ${phase === 'incoming' ? 'call-ring-shake' : ''}`}>
        <Avatar name={peer.name} photoUrl={peer.avatar_url} size={size} />
      </div>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  className,
  pressed,
  big,
  children,
}: {
  label: string
  onClick: () => void
  className: string
  pressed?: boolean
  big?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex items-center justify-center rounded-full transition-transform duration-300 hover:opacity-90 active:scale-90 ${
        big ? 'h-12 w-12' : 'h-9 w-9'
      } ${className}`}
    >
      {children}
    </button>
  )
}

// The phone button in a conversation header. Hidden for bots; disabled while you're already on a call.
export function CallButton({ peer, isBot, className = '' }: { peer: CallPeer | null; isBot?: boolean; className?: string }) {
  const { phase, startCall } = useCall()
  if (!peer || isBot) return null
  const busy = phase !== 'idle'
  const firstName = peer.name.split(/\s+/)[0]
  return (
    <button
      type="button"
      onClick={() => startCall(peer)}
      disabled={busy}
      aria-label={`Call ${firstName}`}
      title={busy ? "You're already on a call" : `Call ${firstName}`}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-status-success-text hover:bg-status-success-bg disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
    >
      <Phone className="h-[18px] w-[18px]" />
    </button>
  )
}
