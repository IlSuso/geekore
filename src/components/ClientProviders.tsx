'use client'
// src/components/ClientProviders.tsx

import { LocaleProvider } from '@/lib/locale'
import { ThemeProvider } from '@/lib/theme'
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'
import { SyncStatusListener } from '@/components/ui/SyncToast'
import { NavigationProgress } from '@/components/ui/NavigationProgress'
import { useEffect, useRef } from 'react'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PushNotificationsBanner } from '@/components/notifications/PushNotificationsBanner'


// Guard onboarding lato client — copre il caso in cui il browser serva
// la pagina dalla cache bypassando il middleware server.
// Eseguito su ogni navigazione: se l'utente non ha completato l'onboarding
// viene redirectato a /onboarding; se lo ha già fatto non può tornare su /onboarding.
const ONBOARDING_EXEMPT_PATHS = ['/onboarding', '/login', '/register', '/forgot-password', '/privacy', '/terms', '/cookies', '/auth']

function OnboardingGuard() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const isExempt = ONBOARDING_EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const cookieDone = document.cookie.includes('geekore_onboarding_done=1')

      if (cookieDone) {
        // Onboarding già fatto — blocca accesso a /onboarding
        if (pathname === '/onboarding') router.replace('/feed')
        return
      }

      // Cookie assente → verifica DB
      const { data: profile } = await supabase.from('profiles').select('onboarding_done').eq('id', user.id).single()
      if (!profile) return

      if (profile.onboarding_done === true) {
        // Fatto ma cookie perso → ripristina cookie e blocca /onboarding
        document.cookie = 'geekore_onboarding_done=1; path=/; max-age=31536000; SameSite=Lax'
        if (pathname === '/onboarding') router.replace('/feed')
      } else {
        // Non fatto → blocca tutto tranne le path esenti
        if (!isExempt) router.replace('/onboarding')
      }
    }
    check()
  }, [pathname]) // eslint-disable-line

  return null
}

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
        <ServiceWorkerRegistrar />
        <SyncStatusListener />
        <NavigationProgress />
        <OnboardingGuard />
        <RecsWarmer />
        <PWAInstallBanner />
        <PushNotificationsBanner />
        {children}
      </LocaleProvider>
    </ThemeProvider>
  )
}