import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** What can be picked in Settings → Appearance. Black and Neon are dark themes with their own colours. */
export type Theme = 'light' | 'dark' | 'black' | 'neon'
const THEMES: Theme[] = ['light', 'dark', 'black', 'neon']

/** Light or dark, whatever the theme: what charts, logos and the login owl go by. */
export type ThemeMode = 'light' | 'dark'
export const modeOf = (theme: Theme): ThemeMode => (theme === 'light' ? 'light' : 'dark')

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem('theme')
    return THEMES.includes(stored as Theme) ? (stored as Theme) : null
  } catch {
    return null
  }
}

// data-theme is light or dark, which every dark-mode rule keys off; data-palette adds Black's or
// Neon's own colours on top. index.html sets both before the first paint, the same way.
function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', modeOf(theme))
  if (theme === 'black' || theme === 'neon') root.setAttribute('data-palette', theme)
  else root.removeAttribute('data-palette')
}

interface ThemeContextValue {
  theme: Theme
  mode: ThemeMode
  /** True once the person has picked a theme in Settings (it's then remembered); false while following the system. */
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

  useEffect(() => applyTheme(theme), [theme])

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

  return <ThemeContext.Provider value={{ theme, mode: modeOf(theme), manual, chooseTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
