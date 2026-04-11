'use client'
// src/hooks/useCsrf.ts
// S1: Hook per recuperare il CSRF token e allegarlo alle mutation critiche.
//
// Uso:
//   const { csrfFetch } = useCsrf()
//   await csrfFetch('/api/user/delete', { method: 'DELETE' })
//
// csrfFetch è un wrapper su fetch che aggiunge automaticamente X-CSRF-Token.
// Il token viene fetchato una volta per sessione e memoizzato.

import { useCallback, useRef } from 'react'

let cachedToken: string | null = null

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' })
    if (!res.ok) return null
    const { token } = await res.json()
    cachedToken = token
    return token
  } catch {
    return null
  }
}

export function useCsrf() {
  const tokenRef = useRef<string | null>(null)

  const csrfFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    // Usa il token cachato o fetchane uno nuovo
    const token = tokenRef.current || await getToken()
    tokenRef.current = token

    const headers = new Headers(options.headers)
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json')
    if (token) {
      headers.set('X-CSRF-Token', token)
    }

    return fetch(url, { ...options, headers, credentials: 'include' })
  }, [])

  return { csrfFetch }
}