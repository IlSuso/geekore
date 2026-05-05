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
    let cancelled = false

    // PERF CRITICO: getUser() fa round-trip verso Supabase e bloccava il primo caricamento
    // di tutte le tab protette. Usiamo subito la sessione locale per sbloccare la UI,
    // poi verifichiamo l'utente in background. Le API/server restano comunque protette.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setUser(session?.user ?? null)
      setLoading(false)

      supabase.auth.getUser().then(({ data: { user } }) => {
        if (cancelled) return
        setUser(user)
      }).catch(() => {
        if (cancelled) return
        setUser(null)
      })
    }).catch(() => {
      if (cancelled) return
      setUser(null)
      setLoading(false)
    })

    // Listener singolo per cambi di sessione (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
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