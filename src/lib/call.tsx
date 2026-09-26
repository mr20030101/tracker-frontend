import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './api'
import { useAuth } from './auth'
import { callLogBody } from './callLog'
import { sendMessage } from './messages'
import { CALL_RINGBACK_SOUND, CALL_RINGTONE_SOUND, loopSound } from './sound'
import { VOICE_PAUSED_MESSAGE, fetchIceServers } from './voice'

// One-to-one voice calls, started from a conversation in Messages. The call itself is a direct
// WebRTC audio connection (relayed through Cloudflare TURN when needed, like Office voice); a shared
// Realtime broadcast channel carries the ringing and connection set-up messages, each addressed to
// one person. Incoming calls ring anywhere in the app, since the provider sits in the app shell.

const CHANNEL = import.meta.env.VITE_CALL_CHANNEL || 'direct-calls'
// How long a call rings before it's given up as unanswered.
const RING_MS = 30_000
// How long an answered call can take to connect before it's dropped.
const CONNECT_MS = 20_000

export interface CallPeer {
  id: string
  name: string
  avatar_url: string | null
}

// outgoing: ringing them · incoming: they're ringing you · connecting: answered, audio setting up
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active'

type CallSignal =
  | { kind: 'ring'; caller: CallPeer }
  | { kind: 'accept' | 'decline' | 'busy' | 'cancel' | 'hangup' }
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

interface CallMessage {
  callId: string
  from: string
  to: string
  signal: CallSignal
}

interface CallState {
  phase: CallPhase
  peer: CallPeer | null
  // When the audio connected, for the call timer.
  startedAt: number | null
  // Why the last call ended, shown briefly after it does.
  notice: string | null
}

interface CallContextValue extends CallState {
  muted: boolean
  startCall: (peer: CallPeer) => void
  accept: () => void
  decline: () => void
  hangUp: () => void
  toggleMute: () => void
  dismissNotice: () => void
}

// The call in progress, kept outside React state: the channel and connection handlers read it.
interface LiveCall {
  id: string
  peer: CallPeer
  phase: CallPhase
  // You placed the call. The caller writes the call's line into the conversation when it ends.
  outgoing: boolean
  // The ring actually went out (not stopped first by a blocked mic or the monthly cap).
  rang: boolean
  connectedAt: number | null
  pc: RTCPeerConnection | null
  stream: MediaStream | null
  audio: HTMLAudioElement | null
  iceServers: RTCIceServer[]
  pendingIce: RTCIceCandidateInit[]
  timer: ReturnType<typeof setTimeout> | null
  // Stops the ringtone (person called) or ringback (caller) while the call rings.
  stopRinging: (() => void) | null
}

const IDLE: CallState = { phase: 'idle', peer: null, startedAt: null, notice: null }

const CallContext = createContext<CallContextValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const myId = user?.id ?? null
  const queryClient = useQueryClient()
  const [state, setState] = useState<CallState>(IDLE)
  const [muted, setMuted] = useState(false)

  const call = useRef<LiveCall | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const meRef = useRef<CallPeer | null>(null)
  useEffect(() => {
    meRef.current = user ? { id: user.id, name: user.name, avatar_url: user.avatar_url } : null
  }, [user])

  const send = useCallback((callId: string, to: string, signal: CallSignal) => {
    const from = meRef.current?.id
    if (!from) return
    void channelRef.current?.send({ type: 'broadcast', event: 'call', payload: { callId, from, to, signal } satisfies CallMessage })
  }, [])

  const setPhase = useCallback((phase: CallPhase, extra: Partial<CallState> = {}) => {
    if (call.current) call.current.phase = phase
    setState((s) => ({ ...s, phase, peer: call.current?.peer ?? s.peer, ...extra }))
  }, [])

  const clearTimer = () => {
    const c = call.current
    if (c?.timer) clearTimeout(c.timer)
    if (c) c.timer = null
  }
  const stopRinging = () => {
    const c = call.current
    c?.stopRinging?.()
    if (c) c.stopRinging = null
  }

  // Ends the current call locally (telling the other side first when `tell` is given), and as the
  // caller, logs it in the conversation: how long it lasted, or that it was declined or missed.
  const end = useCallback(
    (notice: string | null, tell?: 'cancel' | 'decline' | 'hangup' | 'busy', declined = false) => {
      const c = call.current
      if (!c) return
      if (tell) send(c.id, c.peer.id, { kind: tell })
      if (c.outgoing && c.rang) {
        const body = callLogBody(
          c.connectedAt
            ? { outcome: 'ended', seconds: (Date.now() - c.connectedAt) / 1000 }
            : { outcome: declined ? 'declined' : 'missed' },
        )
        sendMessage(c.peer.id, body)
          .then(() => queryClient.invalidateQueries({ queryKey: ['messages', myId] }))
          .catch(() => {
            // The call log is a nicety; a failed write (e.g. the page closing) just leaves no line.
          })
      }
      clearTimer()
      stopRinging()
      c.pc?.close()
      c.stream?.getTracks().forEach((t) => t.stop())
      if (c.audio) {
        c.audio.srcObject = null
        c.audio.remove()
      }
      call.current = null
      setMuted(false)
      setState({ ...IDLE, notice })
    },
    [send, queryClient, myId],
  )

  // Microphone plus connection servers, for either side. Null (with the call ended) when the mic
  // is blocked or calls are paused for the month.
  const prepareAudio = useCallback(async (tell: 'cancel' | 'decline'): Promise<boolean> => {
    const c = call.current
    if (!c) return false
    try {
      const [stream, ice] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
        fetchIceServers(),
      ])
      if (call.current !== c) {
        stream.getTracks().forEach((t) => t.stop())
        return false
      }
      c.stream = stream
      c.iceServers = ice.iceServers
      if (ice.paused) {
        end(VOICE_PAUSED_MESSAGE, tell)
        return false
      }
      return true
    } catch (err) {
      if (call.current !== c) return false
      end(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in the browser to make calls.'
          : "Couldn't start your microphone.",
        tell,
      )
      return false
    }
  }, [end])

  const openConnection = useCallback(() => {
    const c = call.current
    if (!c || !c.stream) return null
    const pc = new RTCPeerConnection({ iceServers: c.iceServers })
    c.pc = pc
    for (const track of c.stream.getTracks()) pc.addTrack(track, c.stream)
    const audio = document.createElement('audio')
    audio.autoplay = true
    document.body.appendChild(audio)
    c.audio = audio
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track])
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) send(c.id, c.peer.id, { kind: 'ice', candidate: e.candidate.toJSON() })
    }
    pc.onconnectionstatechange = () => {
      if (call.current !== c) return
      if (pc.connectionState === 'connected' && c.phase !== 'active') {
        clearTimer()
        c.connectedAt = Date.now()
        setPhase('active', { startedAt: c.connectedAt })
      } else if (pc.connectionState === 'failed') {
        end(c.phase === 'active' ? 'Call dropped.' : "Couldn't connect the call.", 'hangup')
      }
    }
    clearTimer()
    c.timer = setTimeout(() => {
      if (call.current === c && c.phase !== 'active') end("Couldn't connect the call.", 'hangup')
    }, CONNECT_MS)
    setPhase('connecting')
    return pc
  }, [send, setPhase, end])

  const applyRemote = useCallback(async (pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit) => {
    await pc.setRemoteDescription(sdp)
    const c = call.current
    if (c) await Promise.all(c.pendingIce.splice(0).map((candidate) => pc.addIceCandidate(candidate)))
  }, [])

  const handle = useCallback(
    (msg: CallMessage) => {
      const c = call.current
      const { signal } = msg
      if (signal.kind === 'ring') {
        // Already on (or setting up) a call: they hear "busy".
        if (c) {
          send(msg.callId, msg.from, { kind: 'busy' })
          return
        }
        call.current = {
          id: msg.callId,
          peer: signal.caller,
          phase: 'incoming',
          outgoing: false,
          rang: false,
          connectedAt: null,
          pc: null,
          stream: null,
          audio: null,
          iceServers: [],
          pendingIce: [],
          timer: setTimeout(() => {
            if (call.current?.id === msg.callId) end(`Missed call from ${signal.caller.name}.`)
          }, RING_MS),
          stopRinging: loopSound(CALL_RINGTONE_SOUND),
        }
        setState({ phase: 'incoming', peer: signal.caller, startedAt: null, notice: null })
        return
      }
      if (!c || c.id !== msg.callId || c.peer.id !== msg.from) return
      const name = c.peer.name.split(/\s+/)[0]
      switch (signal.kind) {
        case 'accept': {
          if (c.phase !== 'outgoing') return
          stopRinging()
          const pc = openConnection()
          if (!pc) return
          void pc
            .createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              if (pc.localDescription) send(c.id, c.peer.id, { kind: 'offer', sdp: pc.localDescription.toJSON() })
            })
            .catch(() => end("Couldn't connect the call.", 'hangup'))
          return
        }
        case 'offer': {
          const pc = c.pc
          if (!pc) return
          void applyRemote(pc, signal.sdp)
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              if (pc.localDescription) send(c.id, c.peer.id, { kind: 'answer', sdp: pc.localDescription.toJSON() })
            })
            .catch(() => end("Couldn't connect the call.", 'hangup'))
          return
        }
        case 'answer':
          if (c.pc) void applyRemote(c.pc, signal.sdp).catch(() => end("Couldn't connect the call.", 'hangup'))
          return
        case 'ice':
          if (c.pc?.remoteDescription) void c.pc.addIceCandidate(signal.candidate).catch(() => {})
          else c.pendingIce.push(signal.candidate)
          return
        case 'decline':
          end(`${name} declined the call.`, undefined, true)
          return
        case 'busy':
          end(`${name} is on another call.`)
          return
        case 'cancel':
          end(c.phase === 'incoming' ? `Missed call from ${c.peer.name}.` : null)
          return
        case 'hangup':
          end(c.phase === 'active' ? 'Call ended.' : `${name} couldn't connect.`)
          return
      }
    },
    [send, end, openConnection, applyRemote],
  )

  // The signalling channel, joined for as long as you're signed in.
  const handleRef = useRef(handle)
  useEffect(() => {
    handleRef.current = handle
  })
  useEffect(() => {
    if (!myId) return
    const channel = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } })
    channel.on('broadcast', { event: 'call' }, ({ payload }) => {
      const msg = payload as CallMessage
      if (msg?.to === myId && msg.from !== myId) handleRef.current(msg)
    })
    channel.subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [myId])

  // Leaving the page hangs up (or stops ringing them) rather than leaving them waiting.
  const endRef = useRef(end)
  useEffect(() => {
    endRef.current = end
  })
  useEffect(() => {
    const onLeave = () => {
      const c = call.current
      if (!c) return
      endRef.current(null, c.phase === 'incoming' ? 'decline' : c.phase === 'outgoing' ? 'cancel' : 'hangup')
    }
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      onLeave()
    }
  }, [])

  const startCall = useCallback(
    (peer: CallPeer) => {
      if (call.current || !myId || peer.id === myId) return
      const c: LiveCall = {
        id: crypto.randomUUID(),
        peer,
        phase: 'outgoing',
        outgoing: true,
        rang: false,
        connectedAt: null,
        pc: null,
        stream: null,
        audio: null,
        iceServers: [],
        pendingIce: [],
        timer: null,
        stopRinging: null,
      }
      call.current = c
      setMuted(false)
      setState({ phase: 'outgoing', peer, startedAt: null, notice: null })
      // The mic is asked for first, so they only ring once you're actually able to talk.
      void prepareAudio('cancel').then((ok) => {
        if (!ok || call.current !== c || !meRef.current) return
        send(c.id, peer.id, { kind: 'ring', caller: meRef.current })
        c.rang = true
        c.stopRinging = loopSound(CALL_RINGBACK_SOUND)
        c.timer = setTimeout(() => {
          if (call.current === c && c.phase === 'outgoing') end(`${peer.name.split(/\s+/)[0]} didn't answer.`, 'cancel')
        }, RING_MS)
      })
    },
    [myId, prepareAudio, send, end],
  )

  const accept = useCallback(() => {
    const c = call.current
    if (!c || c.phase !== 'incoming') return
    clearTimer()
    stopRinging()
    setPhase('connecting')
    void prepareAudio('decline').then((ok) => {
      if (!ok || call.current !== c) return
      // The connection is ready before they're told, so their offer always has somewhere to land.
      if (!openConnection()) return
      send(c.id, c.peer.id, { kind: 'accept' })
    })
  }, [prepareAudio, openConnection, send, setPhase])

  const decline = useCallback(() => end(null, 'decline'), [end])
  const hangUp = useCallback(() => {
    const c = call.current
    if (!c) return
    end(null, c.phase === 'outgoing' ? 'cancel' : c.phase === 'incoming' ? 'decline' : 'hangup')
  }, [end])
  const toggleMute = useCallback(() => {
    const next = !muted
    call.current?.stream?.getAudioTracks().forEach((t) => (t.enabled = !next))
    setMuted(next)
  }, [muted])
  const dismissNotice = useCallback(() => setState((s) => ({ ...s, notice: null })), [])

  return (
    <CallContext.Provider value={{ ...state, muted, startCall, accept, decline, hangUp, toggleMute, dismissNotice }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside CallProvider')
  return ctx
}
