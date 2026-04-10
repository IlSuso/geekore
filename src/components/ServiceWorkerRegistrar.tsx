'use client'
// src/components/ServiceWorkerRegistrar.tsx
// Registra il service worker PWA all'avvio dell'app.
// Inserire questo componente in src/app/layout.tsx dentro ClientProviders.

import { useEffect } from 'react'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[SW] Registrato:', reg.scope)

        // Controlla aggiornamenti ogni ora
        setInterval(() => reg.update(), 60 * 60 * 1000)
      })
      .catch(err => {
        console.warn('[SW] Registrazione fallita:', err)
      })
  }, [])

  return null
}