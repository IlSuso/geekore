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
import { androidBack } from '@/hooks/androidBack'
import { PushNotificationsBanner } from '@/components/notifications/PushNotificationsBanner'


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
      if (cookieDone) { if (pathname === '/onboarding') router.replace('/home'); return }
      const { data: profile } = await supabase.from('profiles').select('onboarding_done').eq('id', user.id).single()
      if (!profile) return
      if (profile.onboarding_done === true) {
        document.cookie = 'geekore_onboarding_done=1; path=/; max-age=31536000; SameSite=Lax'
        if (pathname === '/onboarding') router.replace('/home')
      } else { if (!isExempt) router.replace('/onboarding') }
    }
    check()
  }, [pathname]) // eslint-disable-line
  return null
}

function RecsWarmer() {
  const pathname = usePathname()
  const warmed = useRef(false)
  useEffect(() => {
    if (warmed.current) return
    if (pathname === '/for-you') { warmed.current = true; return }
    const t = setTimeout(() => {
      warmed.current = true
      fetch('/api/recommendations?type=all', { method: 'GET', credentials: 'include' }).catch(() => {})
    }, 5000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line
  return null
}

function ThemeColorEnforcer() {
  useEffect(() => {
    const setBlack = () => {
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
        (m as HTMLMetaElement).content = '#000000'
      })
    }
    setBlack()
    window.addEventListener('popstate', setBlack)
    return () => window.removeEventListener('popstate', setBlack)
  }, [])
  return null
}

// ------------------------------------------------------------------
// AndroidBackHandler
//
// APPROCCIO: Navigation API (Chrome 102+, disponibile su tutti i
// dispositivi Android moderni con Chrome aggiornato).
//
// window.navigation.addEventListener('navigate') intercetta la
// navigazione PRIMA che Android mostri l'anteprima Predictive Back.
// Chiamando navigateEvent.intercept() diciamo al browser "gestisco
// io questa navigazione" → Android non mostra l'animazione.
//
// Per i drawer/modal: androidBack.push/pop (nessun pushState).
//
// Fallback per browser senza Navigation API: nessun cuscinetto
// (accettiamo che back esca dall'app — meglio che l'animazione).
// ------------------------------------------------------------------

const MAIN_TABS = new Set(['/home', '/discover', '/for-you', '/swipe'])

function AndroidBackHandler() {
  const router = useRouter()
  const pathnameRef = useRef<string>('')
  const pathname = usePathname()
  pathnameRef.current = pathname

  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return

    // --- Navigation API (Chrome 102+) ---
    const nav = (window as any).navigation
    if (nav) {
      const handleNavigate = (e: any) => {
        // Interessa solo le navigazioni "traverse" (back/forward)
        if (e.navigationType !== 'traverse') return

        // Se è una navigazione verso il passato (back gesture)
        // e la destinazione è diversa dalla pagina corrente
        const dest = e.destination?.url ?? ''
        const current = pathnameRef.current

        // Drawer/modal aperto → intercetta e chiudi
        if (androidBack.hasOpenLayer) {
          e.intercept({
            handler: () => {
              androidBack.handleBack()
              return Promise.resolve()
            }
          })
          return
        }

        // Tab principale non-home → intercetta e vai a /home
        const isMainTab = MAIN_TABS.has(current) || current.startsWith('/profile/')
        if (isMainTab && current !== '/home' && current !== '/') {
          e.intercept({
            handler: () => {
              router.replace('/home')
              return Promise.resolve()
            }
          })
          return
        }

        // Home → lascia passare (chiude l'app)
      }

      nav.addEventListener('navigate', handleNavigate)
      return () => nav.removeEventListener('navigate', handleNavigate)
    }

    // --- Fallback: popstate senza cuscinetto ---
    // Senza Navigation API non possiamo bloccare l'animazione,
    // ma almeno gestiamo il redirect a /home quando possibile.
    // Il cuscinetto NON viene inserito perché causerebbe l'animazione.
    const handlePopstate = (e: PopStateEvent) => {
      e.stopImmediatePropagation()

      if (androidBack.handleBack()) return

      const current = pathnameRef.current
      const isMainTab = MAIN_TABS.has(current) || current.startsWith('/profile/')
      if (isMainTab && current !== '/home' && current !== '/') {
        router.replace('/home')
        return
      }
      history.back()
    }

    window.addEventListener('popstate', handlePopstate, { capture: true })
    return () => window.removeEventListener('popstate', handlePopstate, { capture: true })
  }, [router])

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