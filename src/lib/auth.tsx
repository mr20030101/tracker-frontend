import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, supabase } from './api'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setUser(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const res = await api.get<{ user: User }>('/me')
    setUser(res.data.user)
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
