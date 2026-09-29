import { supabase } from './api'

// ICE servers for voice calls from Messages (lib/call). Google's public STUN server lets two browsers find a direct route to each other, which works on
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

// Everything a call can use to connect: STUN, any fixed TURN from the env, and relay credentials.
export async function fetchIceServers(): Promise<{ iceServers: RTCIceServer[]; hasRelay: boolean; paused: boolean }> {
  const { servers, paused } = await fetchRelayServers()
  return { iceServers: [STUN, ...ENV_TURN, ...servers], hasRelay: ENV_TURN.length > 0 || servers.length > 0, paused }
}
