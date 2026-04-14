'use client'
// src/components/ClientProviders.tsx

import { LocaleProvider } from '@/lib/locale'
import { ThemeProvider } from '@/lib/theme'
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'
import { SyncStatusListener } from '@/components/ui/SyncToast'
import { NavigationProgress } from '@/components/ui/NavigationProgress'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Preriscalda la cache server-side UNA SOLA VOLTA per sessione.
// Non ripete la chiamata se l'utente naviga — serve solo per la prima apertura.
function RecsWarmer() {
  const pathname = usePathname()
  const warmed = useRef(false)

  useEffect(() => {
    if (warmed.current) return      // già eseguito in questa sessione
    if (pathname === '/for-you') {  // già sulla pagina, carica direttamente
      warmed.current = true
      return
    }

    const t = setTimeout(() => {
      warmed.current = true
      fetch('/api/recommendations?type=all', {
        method: 'GET',
        credentials: 'include',
      }).catch(() => {})
    }, 5000) // 5s dopo il mount, ben lontano dal caricamento iniziale

    return () => clearTimeout(t)
  }, []) // [] — esegue solo al mount iniziale, mai più

  return null
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <ServiceWorkerRegistrar />
        <SyncStatusListener />
        <NavigationProgress />
        <RecsWarmer />
        {children}
      </LocaleProvider>
    </ThemeProvider>
  )
}