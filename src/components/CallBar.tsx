import { useEffect, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff, X } from 'lucide-react'
import { useCall, type CallPeer } from '../lib/call'
import { Avatar } from './Avatar'

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
export function CallBar() {
  const { phase, peer, startedAt, notice, muted, accept, decline, hangUp, toggleMute, dismissNotice } = useCall()

  useEffect(() => {
    if (!notice || phase !== 'idle') return
    const timer = setTimeout(dismissNotice, 5000)
    return () => clearTimeout(timer)
  }, [notice, phase, dismissNotice])

  if (phase === 'idle') {
    if (!notice) return null
    return (
      <div role="status" className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
        <PhoneOff className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1">{notice}</span>
        <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
  if (!peer) return null

  const status =
    phase === 'incoming' ? 'is calling you...' : phase === 'outgoing' ? 'Calling...' : phase === 'connecting' ? 'Connecting...' : null

  return (
    <div
      role={phase === 'incoming' ? 'alertdialog' : 'status'}
      aria-label={phase === 'incoming' ? `Incoming call from ${peer.name}` : `Call with ${peer.name}`}
      className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg"
    >
      <PeerAvatar peer={peer} ringing={phase === 'incoming' || phase === 'outgoing'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">{peer.name}</div>
        <div className="text-xs text-gray-500">
          {status ?? (startedAt ? <CallTimer since={startedAt} /> : null)}
          {phase === 'active' && muted && <span className="text-status-danger-text"> · Muted</span>}
        </div>
      </div>
      {phase === 'incoming' ? (
        <div className="flex shrink-0 gap-2">
          <RoundButton label="Decline" onClick={decline} className="bg-status-danger-text text-white">
            <PhoneOff className="h-4 w-4" />
          </RoundButton>
          <RoundButton label="Accept" onClick={accept} className="bg-status-success-text text-white">
            <Phone className="h-4 w-4" />
          </RoundButton>
        </div>
      ) : (
        <div className="flex shrink-0 gap-2">
          {phase === 'active' && (
            <RoundButton
              label={muted ? 'Unmute' : 'Mute'}
              onClick={toggleMute}
              pressed={muted}
              className={muted ? 'bg-status-danger-bg text-status-danger-text' : 'bg-gray-100 text-gray-700'}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </RoundButton>
          )}
          <RoundButton label={phase === 'outgoing' ? 'Cancel call' : 'Hang up'} onClick={hangUp} className="bg-status-danger-text text-white">
            <PhoneOff className="h-4 w-4" />
          </RoundButton>
        </div>
      )}
    </div>
  )
}

function PeerAvatar({ peer, ringing }: { peer: CallPeer; ringing: boolean }) {
  return (
    <div className="relative shrink-0">
      {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-status-success-text/40" />}
      <div className="relative">
        <Avatar name={peer.name} photoUrl={peer.avatar_url} size={40} />
      </div>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  className,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  className: string
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-9 w-9 items-center justify-center rounded-full hover:opacity-90 ${className}`}
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
