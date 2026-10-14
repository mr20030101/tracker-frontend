import { describe, it, expect } from 'vitest'
import { callerShouldActOnResponse } from './callSignal'

// Bugs reproduced: when the callee has two tabs open, the caller can receive accept, busy,
// and decline signals from different tabs for the same call. The caller must act only on the
// first meaningful response (accept/decline/busy) and ignore everything after an accept.
//
// Bug 1: a second callee tab on an existing active call replies 'busy', ending the caller's
//        attempt even though the idle tab (which received the same ring) could still answer.
//        After the first tab answers, the 'busy' should be ignored.
//
// Bug 2: if both tabs race to answer, the caller ends up calling setRemoteDescription twice,
//        causing a DOMException. callerShouldActOnResponse guards both 'accept' signals.
//
// Bug 3 (callee side, see call.tsx): the second callee tab keeps ringing for 30 s then shows
//        "Missed call". Fixed by a BroadcastChannel "answered-elsewhere" message (not a
//        pure-function concern, but covered by the integration path in call.tsx).

describe('callerShouldActOnResponse', () => {
  it('accepts the first accept while outgoing', () => {
    expect(callerShouldActOnResponse('outgoing', false, 'accept')).toBe(true)
  })

  it('accepts a genuine decline before any accept', () => {
    expect(callerShouldActOnResponse('outgoing', false, 'decline')).toBe(true)
  })

  it('accepts busy when no tab has answered yet (genuinely all busy)', () => {
    expect(callerShouldActOnResponse('outgoing', false, 'busy')).toBe(true)
  })

  // Bug 2: second accept (both callee tabs raced)
  it('ignores a second accept after the first has been processed', () => {
    expect(callerShouldActOnResponse('outgoing', true, 'accept')).toBe(false)
  })

  // Bug 1: busy arrives from an already-active callee tab after the idle tab answered
  it('ignores busy that arrives after the first accept', () => {
    expect(callerShouldActOnResponse('outgoing', true, 'busy')).toBe(false)
  })

  // Decline from second tab after first tab already answered
  it('ignores decline that arrives after the first accept', () => {
    expect(callerShouldActOnResponse('outgoing', true, 'decline')).toBe(false)
  })

  // Phase guards: once past outgoing the caller should ignore all of these anyway
  it('ignores accept when caller is no longer outgoing', () => {
    expect(callerShouldActOnResponse('connecting', false, 'accept')).toBe(false)
    expect(callerShouldActOnResponse('active', false, 'accept')).toBe(false)
  })

  it('ignores busy when caller is no longer outgoing', () => {
    expect(callerShouldActOnResponse('connecting', false, 'busy')).toBe(false)
    expect(callerShouldActOnResponse('active', false, 'busy')).toBe(false)
  })

  it('ignores decline when caller is no longer outgoing', () => {
    expect(callerShouldActOnResponse('connecting', false, 'decline')).toBe(false)
    expect(callerShouldActOnResponse('active', false, 'decline')).toBe(false)
  })
})
