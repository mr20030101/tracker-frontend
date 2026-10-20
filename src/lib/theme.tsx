import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem('theme')
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

interface ThemeContextValue {
  theme: Theme
  /** True once the person has picked a theme with the toggle (it's then remembered). */
  manual: boolean
  toggleTheme: () => void
  /**
   * Picks a theme outright (the Settings page), remembered like the toggle. 'system' forgets the
   * pick and follows the device's light/dark setting again, as before anything was chosen.
   */
  chooseTheme: (theme: Theme | 'system') => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme())
  const [manual, setManual] = useState(() => getStoredTheme() !== null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Following the system: switches along with the device (e.g. its own sunset schedule).
  useEffect(() => {
    if (manual) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [manual])

  function toggleTheme() {
    chooseTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function chooseTheme(next: Theme | 'system') {
    const followSystem = next === 'system'
    setTheme(followSystem ? getSystemTheme() : next)
    setManual(!followSystem)
    try {
      if (followSystem) localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
    } catch {
      // Storage may be unavailable (private mode, blocked cookies) — theme still applies for this session.
    }
  }

  return <ThemeContext.Provider value={{ theme, manual, toggleTheme, chooseTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

// Night runs from 6 PM to 5 AM, lining up with the dashboard greeting ("Good evening", "Night owl mode").
const isNightHour = (date: Date) => date.getHours() >= 18 || date.getHours() < 5

/**
 * Whether the playful sky (login page, dashboard banner) shows night. It follows the clock, so the
 * sky matches the greeting, unless the person has picked a theme with the toggle: then it follows that.
 */
export function useNightSky(): boolean {
  const { theme, manual } = useTheme()
  const [night, setNight] = useState(() => isNightHour(new Date()))

  // Re-checked every minute so the sky turns over at 6 PM and 5 AM on a page left open.
  useEffect(() => {
    const timer = setInterval(() => setNight(isNightHour(new Date())), 60_000)
    return () => clearInterval(timer)
  }, [])

  return manual ? theme === 'dark' : night
}
