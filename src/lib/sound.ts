export const MESSAGE_NOTIFICATION_SOUND = '/sounds/universfield-new-notification-012-363675.mp3'
export const ALERT_NOTIFICATION_SOUND = '/sounds/universfield-new-notification-017-352293.mp3'

const cache = new Map<string, HTMLAudioElement>()

export function playSound(src: string) {
  try {
    let audio = cache.get(src)
    if (!audio) {
      audio = new Audio(src)
      cache.set(src, audio)
    }
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Autoplay can be blocked until the user interacts with the page; ignore.
    })
  } catch {
    // ignore (e.g. no Audio support)
  }
}
