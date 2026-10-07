import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// The Halloween look (orange accent, bats, a cobweb, a pumpkin by the logo) is on through October,
// unless the person switches it off with the ghost button; that choice is remembered on the device.
// index.css keys off <html data-season="halloween">, so the colours repaint without touching components.

const STORAGE_KEY = 'halloween'

const isHalloweenSeason = (date: Date) => date.getMonth() === 9

function getStoredOff(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off'
  } catch {
    return false
  }
}

interface SeasonContextValue {
  /** It's October, so the ghost button shows at all. */
  inSeason: boolean
  /** The Halloween look is showing right now. */
  halloween: boolean
  toggleHalloween: () => void
}

const SeasonContext = createContext<SeasonContextValue | null>(null)

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [inSeason] = useState(() => isHalloweenSeason(new Date()))
  const [off, setOff] = useState(getStoredOff)
  const halloween = inSeason && !off

  useEffect(() => {
    if (halloween) document.documentElement.setAttribute('data-season', 'halloween')
    else document.documentElement.removeAttribute('data-season')
  }, [halloween])

  function toggleHalloween() {
    const next = !off
    setOff(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, 'off')
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage may be unavailable (private mode): the choice still holds for this visit.
    }
  }

  return <SeasonContext.Provider value={{ inSeason, halloween, toggleHalloween }}>{children}</SeasonContext.Provider>
}

export function useSeason() {
  const ctx = useContext(SeasonContext)
  if (!ctx) throw new Error('useSeason must be used within SeasonProvider')
  return ctx
}
