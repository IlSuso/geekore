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
// STRATEGIA FINALE: cuscinetto sullo STESSO URL della pagina corrente.
//
// Android mostra l'animazione Predictive Back solo se la entry
// precedente ha un URL/contenuto diverso dalla pagina corrente.
// Se il cuscinetto ha lo stesso URL → Android non ha nulla di diverso
// da mostrare → nessuna animazione.
//
// Flusso:
//   mount → pushState(stesso URL) → stack: [/discover, /discover*]
//   back gesture → popstate → intercettiamo → router.replace('/home')
//                           → pushState(stesso URL /home) → stack: [/home, /home*]
//   back gesture → popstate → siamo su /home → history.back() → esce
//
// Il * indica il cuscinetto. Stesso URL = nessuna anteprima visiva.
// ------------------------------------------------------------------

const MAIN_TABS = new Set(['/home', '/discover', '/for-you', '/swipe'])

function AndroidBackHandler() {
  const router      = useRouter()
  const pathnameRef = useRef<string>('')
  const pathname    = usePathname()
  pathnameRef.current = pathname

  // Inserisce/aggiorna il cuscinetto ogni volta che cambia pathname.
  // pushState con lo stesso URL della pagina corrente → nessuna anteprima.
  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return
    // Usiamo lo stesso href corrente — Android non vede differenze visive
    history.pushState({ gkCushion: true }, '', location.href)
  }, [pathname])

  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return

    const handler = (e: PopStateEvent) => {
      // Se lo stato NON è il nostro cuscinetto, ignora
      // (potrebbe essere una navigazione legittima interna)
      if (!e.state?.gkCushion) return
      e.stopImmediatePropagation()

      // 1. Drawer/modal aperto → chiudi
      if (androidBack.handleBack()) {
        // Rimettiamo il cuscinetto
        setTimeout(() => history.pushState({ gkCushion: true }, '', location.href), 50)
        return
      }

      // 2. Tab non-home → vai a /home
      const current = pathnameRef.current
      const isMainTab = MAIN_TABS.has(current) || current.startsWith('/profile/')
      if (isMainTab && current !== '/home' && current !== '/') {
        router.replace('/home')
        // Il cuscinetto verrà ricreato dall'useEffect sul pathname
        return
      }

      // 3. Home → esci dall'app (non rimettiamo il cuscinetto)
      history.back()
    }

    window.addEventListener('popstate', handler, { capture: true })
    return () => window.removeEventListener('popstate', handler, { capture: true })
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