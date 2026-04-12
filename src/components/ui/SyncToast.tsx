'use client'
// src/components/ui/SyncToast.tsx
// M8: Mostra toast "Azione salvata, verrà sincronizzata quando online"
// e "Sincronizzazione completata ✓" quando il SW processa la coda.
// Monta nel ClientProviders o nel layout per ascoltare i messaggi del SW.

import { useEffect } from 'react'
import { showToast } from '@/components/ui/Toast'

export function SyncStatusListener() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        showToast('✓ Azioni sincronizzate con successo')
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [])

  // Quando torna online: invia FLUSH_SYNC_QUEUE al SW
  useEffect(() => {
    const handleOnline = async () => {
      if (!('serviceWorker' in navigator)) return
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg?.active) {
        reg.active.postMessage({ type: 'FLUSH_SYNC_QUEUE' })
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  return null
}

// ── Hook per intercettare risposte "queued" dalle fetch ───────────────────────
// Wrappa fetch e mostra toast se la risposta ha X-Queued: true

export function useSyncAwareFetch() {
  const syncFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    const response = await fetch(url, options)
    if (response.headers.get('X-Queued') === 'true') {
      showToast('📶 Azione salvata — verrà sincronizzata quando torni online')
    }
    return response
  }

  return { syncFetch }
}
