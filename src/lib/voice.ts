import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './api'

// Proximity voice for the Office page: a direct WebRTC audio connection to each person in voice
// you could hear anyway (see canHear in lib/office), with volume falling off with distance.
// Connections are only open while you're in earshot, so nothing is sent to anyone out of range or
// outside the private office you're in. The office's Realtime channel carries the WebRTC set-up
// messages (offer/answer/ICE); audio never goes through Supabase.

// Google's public STUN server lets two browsers find a direct route to each other, which works on
// many networks. Behind carrier-grade NAT (common with home ISPs) or strict corporate/mobile
// networks, a direct route often doesn't exist and calls need a TURN relay. The relay only forwards
// the encrypted audio; it can't listen in. Two ways to get one:
// - the turn-credentials edge function (Cloudflare Realtime TURN), asked for fresh credentials each
//   time you join voice; or
// - fixed credentials from a provider like Metered, via VITE_TURN_URL / VITE_TURN_USERNAME /
//   VITE_TURN_CREDENTIAL (visible in the site's JavaScript, so only for providers that allow that).
const STUN: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' }
const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined
const ENV_TURN: RTCIceServer[] = TURN_URL
  ? [{ urls: TURN_URL.split(',').map((u) => u.trim()), username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
  : []

// This month's relay data against the cap the turn-credentials edge function enforces (Cloudflare
// bills past 1,000 GB a month, and voice pauses a little before that).
export interface RelayUsage {
  usedGb: number | null
  limitGb: number
  paused: boolean
  month: string
  error?: string
}

export const VOICE_PAUSED_MESSAGE = "Voice calls are paused until next month: this month's call data limit has been reached."

// Relay servers from the edge function, or none if it isn't deployed/configured (calls then try
// direct routes only). `paused` means the monthly data cap was reached and voice shouldn't start.
async function fetchRelayServers(): Promise<{ servers: RTCIceServer[]; paused: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('turn-credentials')
    if (error) return { servers: [], paused: false }
    return { servers: Array.isArray(data?.iceServers) ? data.iceServers : [], paused: data?.paused === true }
  } catch {
    return { servers: [], paused: false }
  }
}

export async function fetchRelayUsage(): Promise<RelayUsage | null> {
  const { data, error } = await supabase.functions.invoke('turn-credentials', { body: { usageOnly: true } })
  if (error) return null
  return (data?.usage as RelayUsage | undefined) ?? null
}

const CONNECT_TIMEOUT_MS = 10_000
// Someone who drops out of earshot goes silent at once but stays connected this long, so walking
// along the edge of someone's range doesn't hang up and redial over and over.
const HANG_UP_AFTER_MS = 3_000
// How often calls to people in range who aren't connected yet are tried again. A first call can go
// out before the other side knows you've joined (they decline it), or simply fail; without retrying,
// two people standing still next to each other would never connect.
const RETRY_MS = 3_000

export type VoiceSignal =
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'bye' }

export interface VoiceSignalMessage {
  from: string
  to: string
  signal: VoiceSignal
}

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  // ICE candidates that arrive before the remote description is set.
  pendingIce: RTCIceCandidateInit[]
}

export type VoiceState = 'off' | 'starting' | 'on' | 'error'

function setVolume(audio: HTMLAudioElement, volume: number) {
  audio.volume = Math.min(1, Math.max(0, volume))
}

export function useProximityVoice({
  myId,
  enabled,
  muted,
  wanted,
  sendSignal,
  onSignal,
}: {
  myId: string | null
  enabled: boolean
  muted: boolean
  // Who you should be talking to right now, and how loud they should be (0–1).
  wanted: Map<string, number>
  sendSignal: (msg: VoiceSignalMessage) => void
  // Registers the handler the office channel calls with every voice message addressed to you.
  onSignal: (listener: ((msg: VoiceSignalMessage) => void) | null) => void
}) {
  const [micReady, setMicReady] = useState(false)
  const iceServers = useRef<RTCIceServer[]>([STUN, ...ENV_TURN])
  const [hasRelay, setHasRelay] = useState(ENV_TURN.length > 0)
  const [error, setError] = useState<string | null>(null)
  const state: VoiceState = !enabled ? (error ? 'error' : 'off') : micReady ? 'on' : error ? 'error' : 'starting'
  const [retryTick, setRetryTick] = useState(0)
  useEffect(() => {
    if (state !== 'on') return
    const timer = setInterval(() => setRetryTick((t) => t + 1), RETRY_MS)
    return () => clearInterval(timer)
  }, [state])
  const clearError = useCallback(() => setError(null), [])
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const streamRef = useRef<MediaStream | null>(null)
  const peers = useRef(new Map<string, Peer>())
  const sendRef = useRef(sendSignal)
  const wantedRef = useRef(wanted)
  useLayoutEffect(() => {
    sendRef.current = sendSignal
    wantedRef.current = wanted
  })

  const markConnected = useCallback(() => {
    setConnected(new Set([...peers.current].filter(([, p]) => p.pc.connectionState === 'connected').map(([id]) => id)))
  }, [])

  const closePeer = useCallback(
    (id: string, tellThem: boolean) => {
      const peer = peers.current.get(id)
      if (!peer) return
      peers.current.delete(id)
      peer.pc.close()
      peer.audio.srcObject = null
      peer.audio.remove()
      if (tellThem && myId) sendRef.current({ from: myId, to: id, signal: { kind: 'bye' } })
      markConnected()
    },
    [myId, markConnected],
  )

  const openPeer = useCallback(
    (id: string): Peer | null => {
      const stream = streamRef.current
      if (!stream || !myId) return null
      const pc = new RTCPeerConnection({ iceServers: iceServers.current })
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.volume = wantedRef.current.get(id) ?? 1
      document.body.appendChild(audio)
      const peer: Peer = { pc, audio, pendingIce: [] }
      peers.current.set(id, peer)
      for (const track of stream.getTracks()) pc.addTrack(track, stream)
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track])
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) sendRef.current({ from: myId, to: id, signal: { kind: 'ice', candidate: e.candidate.toJSON() } })
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') closePeer(id, false)
        markConnected()
      }
      // A call that never connects (no answer, no route) is dropped so it can be tried again.
      setTimeout(() => {
        if (peers.current.get(id) === peer && pc.connectionState !== 'connected') closePeer(id, false)
      }, CONNECT_TIMEOUT_MS)
      return peer
    },
    [myId, closePeer, markConnected],
  )

  // Start/stop the microphone with the voice toggle.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // Relay credentials are fetched alongside the microphone, so calls can use them from the start.
    const relay = fetchRelayServers()
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(async (stream) => {
        const { servers: relayServers, paused } = await relay
        if (cancelled || paused) {
          stream.getTracks().forEach((t) => t.stop())
          if (paused && !cancelled) setError(VOICE_PAUSED_MESSAGE)
          return
        }
        iceServers.current = [STUN, ...ENV_TURN, ...relayServers]
        setHasRelay(ENV_TURN.length > 0 || relayServers.length > 0)
        streamRef.current = stream
        setMicReady(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in the browser to join voice.'
            : "Couldn't start your microphone.",
        )
      })
    const open = peers.current
    return () => {
      cancelled = true
      for (const id of [...open.keys()]) closePeer(id, true)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setMicReady(false)
    }
  }, [enabled, closePeer])

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  }, [muted, state])

  // Connect to whoever you should hear, hang up on whoever you shouldn't, and set volumes. The one
  // with the smaller id makes the offer, so two people never call each other at once.
  useEffect(() => {
    if (state !== 'on' || !myId) return
    for (const [id, volume] of wanted) {
      const existing = peers.current.get(id)
      if (existing) {
        setVolume(existing.audio, volume)
        continue
      }
      if (myId < id) {
        const peer = openPeer(id)
        if (!peer) continue
        void peer.pc
          .createOffer()
          .then((offer) => peer.pc.setLocalDescription(offer))
          .then(() => {
            if (peer.pc.localDescription) sendRef.current({ from: myId, to: id, signal: { kind: 'offer', sdp: peer.pc.localDescription.toJSON() } })
          })
          .catch(() => closePeer(id, false))
      }
    }
    for (const [id, peer] of peers.current) {
      if (wanted.has(id)) continue
      setVolume(peer.audio, 0)
      setTimeout(() => {
        if (!wantedRef.current.has(id)) closePeer(id, true)
      }, HANG_UP_AFTER_MS)
    }
    // retryTick re-runs this every few seconds, so anyone still wanted but not connected is called again.
  }, [state, myId, wanted, openPeer, closePeer, retryTick])

  // Incoming set-up messages.
  useEffect(() => {
    onSignal((msg) => {
      if (state !== 'on' || !myId || msg.to !== myId) return
      const { from, signal } = msg
      if (signal.kind === 'bye') {
        closePeer(from, false)
        return
      }
      if (signal.kind === 'offer') {
        // Only pick up if you could hear them. They may see you in range a moment before you do;
        // saying bye lets them hang up and call again once you're both in range.
        if (!wantedRef.current.has(from)) {
          sendRef.current({ from: myId, to: from, signal: { kind: 'bye' } })
          return
        }
        closePeer(from, false)
        const peer = openPeer(from)
        if (!peer) return
        void peer.pc
          .setRemoteDescription(signal.sdp)
          .then(() => Promise.all(peer.pendingIce.splice(0).map((c) => peer.pc.addIceCandidate(c))))
          .then(() => peer.pc.createAnswer())
          .then((answer) => peer.pc.setLocalDescription(answer))
          .then(() => {
            if (peer.pc.localDescription) sendRef.current({ from: myId, to: from, signal: { kind: 'answer', sdp: peer.pc.localDescription.toJSON() } })
          })
          .catch(() => closePeer(from, false))
        return
      }
      const peer = peers.current.get(from)
      if (!peer) return
      if (signal.kind === 'answer') {
        void peer.pc
          .setRemoteDescription(signal.sdp)
          .then(() => Promise.all(peer.pendingIce.splice(0).map((c) => peer.pc.addIceCandidate(c))))
          .catch(() => closePeer(from, false))
      } else if (signal.kind === 'ice') {
        if (peer.pc.remoteDescription) void peer.pc.addIceCandidate(signal.candidate).catch(() => {})
        else peer.pendingIce.push(signal.candidate)
      }
    })
    return () => onSignal(null)
  }, [state, myId, openPeer, closePeer, onSignal])

  return { state, error, clearError, connected, hasRelay }
}
