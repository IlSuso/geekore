'use client'
// src/components/ClientProviders.tsx

import { LocaleProvider } from '@/lib/locale'
import { ThemeProvider } from '@/lib/theme'
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'
import { SyncStatusListener } from '@/components/ui/SyncToast'
import { NavigationProgress } from '@/components/ui/NavigationProgress'
import { useEffect, useRef } from 'react'
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'
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

// Swipe orizzontale tra tab — stile Instagram
function SwipeNav() {
  useSwipeNavigation()
  return null
}

// Forza theme-color nero via JS — più affidabile del solo meta tag su Android PWA
function ThemeColorEnforcer() {
  useEffect(() => {
    const setBlack = () => {
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
        (m as HTMLMetaElement).content = '#000000'
      })
    }
    setBlack()
    // Ripeti ad ogni navigazione (Next.js router)
    window.addEventListener('popstate', setBlack)
    return () => window.removeEventListener('popstate', setBlack)
  }, [])
  return null
}

export function ClientProviders({ children, initialLocale = 'it' }: { children: React.ReactNode; initialLocale?: 'it' | 'en' }) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={initialLocale}>
        <ThemeColorEnforcer />
        <SwipeNav />
        <ServiceWorkerRegistrar />
        <SyncStatusListener />
        <NavigationProgress />
        <RecsWarmer />
        <PWAInstallBanner />
        {children}
      </LocaleProvider>
    </ThemeProvider>
  )
}