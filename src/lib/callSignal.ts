import type { CallPhase } from './call'

// Returns whether the caller should act on a response signal given its current phase and whether
// it has already processed a first accept. Guards against multi-tab callees where one idle tab
// answers while another (already-active) tab sends busy, or both tabs race to send accept.
export function callerShouldActOnResponse(
  phase: CallPhase,
  acceptedOnce: boolean,
  _kind: 'accept' | 'busy' | 'decline',
): boolean {
  if (phase !== 'outgoing') return false
  if (acceptedOnce) return false
  return true
}
