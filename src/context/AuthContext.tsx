'use client'
// src/context/AuthContext.tsx
// PERF: sblocca la UI con getSession() locale, poi verifica getUser() in background.
// getUser() fa round-trip a Supabase: non deve tenere fermo il primo render delle tab.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthCtx {
  user: User | null
  /** true solo mentre leggiamo la sessione locale iniziale */
  loading: boolean
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function init() {
      // 1) Fast path: sessione da storage/cookie locale. È ciò che serve alla UI.
      const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any))
      if (cancelled) return
      setUser(sessionData.session?.user ?? null)
      setLoading(false)

      // 2) Verifica remota non bloccante: se la sessione non è più valida, corregge dopo.
      supabase.auth.getUser()
        .then(({ data }) => {
          if (!cancelled) setUser(data.user ?? null)
        })
        .catch(() => {
          if (!cancelled) setUser(null)
        })
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
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

export function useUser(): User | null {
  return useContext(AuthContext).user
}
