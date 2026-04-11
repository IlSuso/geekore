'use client'
// src/hooks/useSupabaseQuery.ts
// Hook generico per query Supabase con loading/error/data state standardizzato.
// Roadmap #4 — elimina pagine bianche e spinner infiniti su errori DB/RLS.
//
// Uso:
//   const { data, loading, error, refetch } = useSupabaseQuery(
//     () => supabase.from('posts').select('*').limit(10),
//     [userId]            ← deps array, refetch quando cambiano
//   )

import { useState, useEffect, useCallback, useRef } from 'react'

type QueryFn<T> = () => PromiseLike<{ data: T | null; error: any }>

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface QueryResult<T> extends QueryState<T> {
  refetch: () => void
}

export function useSupabaseQuery<T>(
  queryFn: QueryFn<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  // Previene setState su componenti smontati
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const run = useCallback(async () => {
    if (mountedRef.current) {
      setState(s => ({ ...s, loading: true, error: null }))
    }

    try {
      const { data, error } = await queryFn()

      if (!mountedRef.current) return

      if (error) {
        // Messaggi user-friendly basati sul codice errore Supabase/Postgres
        let message = 'Si è verificato un errore. Riprova.'
        if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
          message = 'Sessione scaduta. Ricarica la pagina.'
        } else if (error.code === '42501' || error.message?.includes('permission')) {
          message = 'Non hai i permessi per questa azione.'
        } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
          message = 'Problemi di connessione. Controlla la rete.'
        } else if (error.code === '23505') {
          message = 'Elemento già presente.'
        }
        setState({ data: null, loading: false, error: message })
      } else {
        setState({ data, loading: false, error: null })
      }
    } catch (err: any) {
      if (!mountedRef.current) return
      const isOffline = !navigator.onLine
      setState({
        data: null,
        loading: false,
        error: isOffline
          ? 'Sei offline. Controlla la connessione.'
          : err?.message || 'Errore imprevisto.',
      })
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run()
  }, [run])

  return { ...state, refetch: run }
}