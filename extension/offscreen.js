// Plays the task alarm for background.js, which can't play sound itself. The same alert sound the
// tracker uses (ALERT_NOTIFICATION_SOUND in src/lib/sound.ts), three times over.
const PLAYS = 3

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== 'offscreen' || message.type !== 'play-alarm') return
  let played = 0
  const audio = new Audio('alarm.mp3')
  audio.addEventListener('ended', () => {
    played += 1
    if (played < PLAYS) audio.play().catch(() => {})
  })
  audio.play().catch(() => {})
})
