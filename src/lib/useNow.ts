import { useEffect, useState } from 'react'

/** The current time, re-read every `everyMs`, for anything that ages on screen ("waiting 5 h"). */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])

  return now
}
