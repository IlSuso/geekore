'use client'
// src/components/ClientProviders.tsx

import { LocaleProvider } from '@/lib/locale'
import { ThemeProvider } from '@/lib/theme'
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'
import { SyncStatusListener } from '@/components/ui/SyncToast'
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
        if (pathname === '/onboarding') router.replace('/home')
        return
      }

      // Cookie assente → verifica DB
      const { data: profile } = await supabase.from('profiles').select('onboarding_done').eq('id', user.id).single()
      if (!profile) return

      if (profile.onboarding_done === true) {
        // Fatto ma cookie perso → ripristina cookie e blocca /onboarding
        document.cookie = 'geekore_onboarding_done=1; path=/; max-age=31536000; SameSite=Lax'
        if (pathname === '/onboarding') router.replace('/home')
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


// AndroidBackHandler — gestisce la back gesture di Android sulle tab principali.
//
// Comportamento identico a Instagram su Android:
//   • Da qualsiasi tab principale (non home) → torna a /home
//   • Da /home → lascia uscire dall'app (comportamento di default del sistema)
//   • Da drawer/modal → non interviene (gestito dai drawer stessi)
//
// Come funziona:
//   Quando Android fa scattare la back gesture, il browser emette un evento
//   'popstate'. Noi lo intercettiamo in capture phase (prima di Next.js) e,
//   se siamo su una tab principale ≠ home, facciamo router.replace('/home')
//   e blocchiamo la propagazione. Next.js non vede il popstate e non naviga
//   nella history — l'utente rimane nell'app.
//
//   Per far sì che la back gesture dalla HOME chiuda effettivamente l'app,
//   non facciamo nulla: il popstate arriva al browser che termina la PWA.
const MAIN_TABS = new Set(['/discover', '/for-you', '/swipe'])
// /profile/* è gestita sotto separatamente

function AndroidBackHandler() {
  const pathname = usePathname()
  const router   = useRouter()

  useEffect(() => {
    // Solo su Android (back gesture nativa)
    const isAndroid = /android/i.test(navigator.userAgent)
    if (!isAndroid) return

    const handler = (e: PopStateEvent) => {
      // Siamo su una tab principale (non home)?
      const isMainTab = MAIN_TABS.has(pathname) || pathname.startsWith('/profile/')
      if (!isMainTab) return // drawer/modal/pagine secondarie: lascia fare al sistema

      // Siamo su /home: lascia uscire dall'app
      if (pathname === '/home' || pathname === '/') return

      // Qualsiasi altra tab principale → torna a home
      e.stopImmediatePropagation()
      router.replace('/home')
    }

    window.addEventListener('popstate', handler, { capture: true })
    return () => window.removeEventListener('popstate', handler, { capture: true })
  }, [pathname, router])

  return null
}

export function ClientProviders({ children, initialLocale = 'it' }: { children: React.ReactNode; initialLocale?: 'it' | 'en' }) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={initialLocale}>
        <ThemeColorEnforcer />
        <AndroidBackHandler />
        <ServiceWorkerRegistrar />
        <SyncStatusListener />
        <OnboardingGuard />
        <RecsWarmer />
        <PWAInstallBanner />
        <PushNotificationsBanner />
        {children}
      </LocaleProvider>
    </ThemeProvider>
  )
}