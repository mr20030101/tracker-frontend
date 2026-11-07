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
  /** True once the person has picked Light or Dark in Settings (it's then remembered); false while following the system. */
  manual: boolean
  /**
   * Picks a theme in Settings → Appearance, remembered on the device. 'system' forgets the
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

  return <ThemeContext.Provider value={{ theme, manual, chooseTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

