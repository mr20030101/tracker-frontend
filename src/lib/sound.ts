export const MESSAGE_NOTIFICATION_SOUND = '/sounds/universfield-new-notification-012-363675.mp3'
export const ALERT_NOTIFICATION_SOUND = '/sounds/universfield-new-notification-017-352293.mp3'

// Calls (lib/call): what the caller hears while it rings, and the ringtone of the person called.
export const CALL_RINGBACK_SOUND = '/sounds/freesound_community-phone-ringing-101221.mp3'
export const CALL_RINGTONE_SOUND = '/sounds/universfield-ringtone-011-151762.mp3'

const SOUND_SRCS = [MESSAGE_NOTIFICATION_SOUND, ALERT_NOTIFICATION_SOUND, CALL_RINGBACK_SOUND, CALL_RINGTONE_SOUND]

const cache = new Map<string, HTMLAudioElement>()

function getAudio(src: string): HTMLAudioElement {
  let audio = cache.get(src)
  if (!audio) {
    audio = new Audio(src)
    audio.preload = 'auto'
    cache.set(src, audio)
  }
  return audio
}

export function playSound(src: string) {
  try {
    const audio = getAudio(src)
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Blocked by the browser's autoplay policy until the page is unlocked; ignore.
    })
  } catch {
    // ignore (e.g. no Audio support)
  }
}

// Plays a sound on repeat until the returned function is called.
export function loopSound(src: string): () => void {
  let audio: HTMLAudioElement | null = null
  try {
    audio = getAudio(src)
    audio.loop = true
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Blocked by the browser's autoplay policy until the page is unlocked; ignore.
    })
  } catch {
    // ignore (e.g. no Audio support)
  }
  return () => {
    if (!audio) return
    audio.loop = false
    audio.pause()
    audio.currentTime = 0
  }
}

let unlocked = false

// Realtime events fire outside of any user gesture, so most browsers (and
// especially iOS Safari) refuse audio.play() until each element has been
// played once from inside a genuine click/keydown handler. Prime them all
// on the first interaction anywhere in the app so later programmatic
// playSound() calls are allowed to go through.
function unlock() {
  if (unlocked) return
  unlocked = true
  for (const src of SOUND_SRCS) {
    const audio = getAudio(src)
    audio.muted = true
    audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
      })
      .catch(() => {
        // ignore; a later playSound() call may still succeed
      })
      .finally(() => {
        audio.muted = false
      })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}
