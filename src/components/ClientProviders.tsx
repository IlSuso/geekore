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

      if (cookieDone) {
        if (pathname === '/onboarding') router.replace('/home')
        return
      }

      const { data: profile } = await supabase.from('profiles').select('onboarding_done').eq('id', user.id).single()
      if (!profile) return

      if (profile.onboarding_done === true) {
        document.cookie = 'geekore_onboarding_done=1; path=/; max-age=31536000; SameSite=Lax'
        if (pathname === '/onboarding') router.replace('/home')
      } else {
        if (!isExempt) router.replace('/onboarding')
      }
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
    if (pathname === '/for-you') {
      warmed.current = true
      return
    }

    const t = setTimeout(() => {
      warmed.current = true
      fetch('/api/recommendations?type=all', {
        method: 'GET',
        credentials: 'include',
      }).catch(() => {})
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


// AndroidBackHandler — gestione centralizzata back gesture Android.
//
// STRATEGIA CUSCINETTO SINGOLO:
//   Al mount iniziale dell'app inseriamo UNA SOLA entry extra nella history.
//   Le navigazioni tra tab usano router.replace → non aggiungono entries.
//   Quindi lo stack è sempre: [entry_reale, cuscinetto]
//
//   Quando Android fa back → consuma il cuscinetto → popstate.
//   Noi intercettiamo, decidiamo, e rifacciamo pushState del cuscinetto
//   (tranne quando vogliamo uscire dall'app).
//
//   NON rifacciamo pushState ad ogni cambio pathname — questo era il
//   problema: Android vedeva entries "nuove" e mostrava l'anteprima.
//
//   I drawer/modal registrano solo una callback tramite androidBack.push()
//   senza toccare la history — così Android non vede nulla da mostrare.

const MAIN_TABS = new Set(['/home', '/discover', '/for-you', '/swipe'])

function AndroidBackHandler() {
  const pathname = usePathname()
  const router   = useRouter()
  const cushionInstalled = useRef(false)

  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

  // Inserisce il cuscinetto UNA SOLA VOLTA al mount iniziale
  useEffect(() => {
    if (!isAndroid) return
    if (cushionInstalled.current) return
    cushionInstalled.current = true
    // Piccolo delay per lasciare che Next.js completi l'hydration
    const t = setTimeout(() => {
      history.pushState({ gkCushion: true }, '', location.href)
    }, 100)
    return () => clearTimeout(t)
  }, [isAndroid]) // [] effettivo — isAndroid non cambia mai

  useEffect(() => {
    if (!isAndroid) return

    const handler = (e: PopStateEvent) => {
      // Intercettiamo sempre — il cuscinetto è stato consumato
      e.stopImmediatePropagation()

      // 1. Drawer/modal aperto → chiudi quello
      if (androidBack.handleBack()) {
        // Ricarichiamo il cuscinetto dopo la chiusura
        setTimeout(() => history.pushState({ gkCushion: true }, '', location.href), 50)
        return
      }

      // 2. Tab principale ≠ home → vai a home
      const isMainTab = MAIN_TABS.has(pathname) || pathname.startsWith('/profile/')
      if (isMainTab && pathname !== '/home' && pathname !== '/') {
        router.replace('/home')
        // Ricarichiamo il cuscinetto (pathname cambierà ma il useEffect
        // non lo reinstallerà perché cushionInstalled.current è già true)
        setTimeout(() => history.pushState({ gkCushion: true }, '', location.href), 150)
        return
      }

      // 3. Siamo su home → esci dall'app
      // NON rifacciamo pushState — il prossimo back uscirà dall'app
      history.back()
    }

    window.addEventListener('popstate', handler, { capture: true })
    return () => window.removeEventListener('popstate', handler, { capture: true })
  }, [pathname, router, isAndroid])

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