'use client'
// src/context/AuthContext.tsx
// PERF FIX: un solo getUser() + onAuthStateChange per tutta l'app.
// Tutti i componenti che prima chiamavano supabase.auth.getUser() individualmente
// leggono ora questo context → zero round-trip duplicati.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthCtx {
  user: User | null
  /** true finché il primo getUser() non ha risposto */
  loading: boolean
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Caricamento iniziale — una sola volta per tutta l'app
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // Listener singolo per cambi di sessione (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  return useContext(AuthContext)
}

/** Shorthand — restituisce solo lo user (il caso più comune) */
export function useUser(): User | null {
  return useContext(AuthContext).user
}