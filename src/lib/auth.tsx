import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, logActivity, supabase, touchPresence } from './api'
import type { User } from '../types'

const PRESENCE_INTERVAL_MS = 60_000

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  recovering: boolean
  clearRecovery: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Set when the user arrives from a password-reset email. Tracked here, not in Login, because the
  // link can land on any route (Supabase falls back to the Site URL, i.e. "/", when the requested
  // redirect isn't allow-listed) and the event only fires once.
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setUser(null)
        return
      }
      try {
        const res = await api.get<{ user: User }>('/me')
        setUser(res.data.user)
      } catch {
        setUser(null)
      }
    }).finally(() => setLoading(false))
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (!session) setUser(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    touchPresence()
    const interval = setInterval(touchPresence, PRESENCE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [user])

  async function login(email: string, password: string) {
    const trimmedEmail = email.trim()
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
    if (error) {
      logActivity('login_failed', null, trimmedEmail)
      throw error
    }
    const res = await api.get<{ user: User }>('/me')
    setUser(res.data.user)
    logActivity('login', res.data.user.id)
  }

  async function logout() {
    if (user) logActivity('logout', user.id)
    await supabase.auth.signOut()
    setUser(null)
  }

  async function refreshUser() {
    const res = await api.get<{ user: User }>('/me')
    setUser(res.data.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, recovering, clearRecovery: () => setRecovering(false) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
