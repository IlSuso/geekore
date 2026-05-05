'use client'
// src/components/ClientProviders.tsx

import dynamic from 'next/dynamic'
import { LocaleProvider } from '@/lib/locale'
import { ThemeProvider } from '@/lib/theme'
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'
import { SyncStatusListener } from '@/components/ui/SyncToast'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { androidBack } from '@/hooks/androidBack'
import { AuthProvider, useAuth } from '@/context/AuthContext'

// PERF: componenti globali non critici fuori dal bundle iniziale.
// Si caricano dopo l'idratazione, senza competere con il primo render della tab.
const PWAInstallBanner = dynamic(() => import('@/components/PWAInstallBanner').then(m => m.PWAInstallBanner), { ssr: false })
const PushNotificationsBanner = dynamic(() => import('@/components/notifications/PushNotificationsBanner').then(m => m.PushNotificationsBanner), { ssr: false })
const UserPresenceTracker = dynamic(() => import('@/components/UserPresenceTracker').then(m => m.UserPresenceTracker), { ssr: false })

const ONBOARDING_EXEMPT_PATHS = ['/onboarding', '/login', '/register', '/forgot-password', '/privacy', '/terms', '/cookies', '/auth']

function OnboardingGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    const isExempt = ONBOARDING_EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    if (!user) return

    // Fast path: se il cookie locale dice già completato, non fare nessuna query Supabase a ogni cambio pagina.
    const cookieDone = document.cookie.includes('geekore_onboarding_done=1')
    if (cookieDone) {
      if (pathname === '/onboarding') router.replace('/home')
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_done')
        .eq('id', user.id)
        .single()

      if (cancelled || !profile) return
      if (profile.onboarding_done === true) {
        document.cookie = 'geekore_onboarding_done=1; path=/; max-age=31536000; SameSite=Lax'
        if (pathname === '/onboarding') router.replace('/home')
      } else if (!isExempt) {
        router.replace('/onboarding')
      }
    }, isExempt ? 0 : 600)

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [pathname, router, user, loading])

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

// Nasconde lo splash screen Capacitor non appena la pagina è interattiva
function SplashHider() {
  useEffect(() => {
    const hide = async () => {
      try {
        // Capacitor SplashScreen — disponibile solo nell'app nativa
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: 300 })
      } catch {
        // Browser/PWA normale — non fa nulla
      }
    }
    // Aspetta che il DOM sia pronto e la pagina visibile
    if (document.readyState === 'complete') {
      hide()
    } else {
      window.addEventListener('load', hide, { once: true })
    }
  }, [])
  return null
}

// ------------------------------------------------------------------
// AndroidBackHandler
//
// Riceve l'evento 'androidBackButton' sparato da MainActivity.java
// tramite getBridge().triggerJSEvent().
// Niente cuscinetti, niente popstate, niente lotta con Chrome.
//
// Comportamento:
//   - Drawer/modal aperto  → chiude drawer/modal
//   - Tab non-home         → router.replace('/home')
//   - /home                → non fa nulla, Android minimizza l'app
// ------------------------------------------------------------------

// Tab principali: back gesture → /home
const MAIN_TABS = new Set(['/home', '/discover', '/for-you', '/swipe'])

// Mappa route secondarie → dove torna il back gesture
const BACK_ROUTES: Record<string, string> = {
  '/settings':      '/profile/me',
  '/profile/edit':  '/profile/me',
  '/notifications': '/home',
}

// Chiude tutti i layer (modal/drawer) quando l'utente naviga via navbar
function NavbarLayerCloser() {
  const pathname = usePathname()
  const prevRef  = useRef<string>('')

  useEffect(() => {
    if (prevRef.current && prevRef.current !== pathname) {
      androidBack.closeAll()
    }
    prevRef.current = pathname
  }, [pathname])

  return null
}

function AndroidBackHandler() {
  const router      = useRouter()
  const pathnameRef = useRef<string>('')
  const pathname    = usePathname()
  pathnameRef.current = pathname

  useEffect(() => {
    const handler = () => {
      // 1. Drawer/modal aperto → chiudi
      if (androidBack.hasOpenLayer) {
        androidBack.handleBack()
        return
      }

      const current = pathnameRef.current

      // 2. Route secondarie con destinazione esplicita
      for (const [prefix, dest] of Object.entries(BACK_ROUTES)) {
        if (current === prefix || current.startsWith(prefix + '/')) {
          router.replace(dest)
          return
        }
      }

      const isMainTab = MAIN_TABS.has(current) || current.startsWith('/profile/')

      // 3. Tab non-home → vai a /home
      if (isMainTab && current !== '/home' && current !== '/') {
        router.replace('/home')
        return
      }

      // 4. Su /home → non facciamo nulla.
      // Android riceve il controllo e minimizza l'app.
    }

    window.addEventListener('androidBackButton', handler)
    return () => window.removeEventListener('androidBackButton', handler)
  }, [router])

  return null
}

export function ClientProviders({ children, initialLocale = 'it' }: { children: React.ReactNode; initialLocale?: 'it' | 'en' }) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={initialLocale}>
        <AuthProvider>
          <ThemeColorEnforcer />
          <SplashHider />
          <AndroidBackHandler />
          <NavbarLayerCloser />
          <ServiceWorkerRegistrar />
          <SyncStatusListener />
          <OnboardingGuard />
          <PWAInstallBanner />
          <PushNotificationsBanner />
          <UserPresenceTracker />
          {children}
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}