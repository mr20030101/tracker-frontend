import { useEffect, useState } from 'react'
import { serverNow } from './serverClock'

/** The current time by the server's clock, re-read every `everyMs`, for anything that ages on screen ("waiting 5 h"). */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])

  return now
}
