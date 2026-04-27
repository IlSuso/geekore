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
// Comportamento voluto:
//   - Back da tab principale (/discover, /for-you, /swipe, /profile)
//     → sempre /home
//   - Back da /home → chiude l'app
//   - Back con drawer/modal aperto → chiude drawer/modal
//
// Strategia: cuscinetto pushState al mount e dopo ogni azione gestita.
// Il popstate viene sempre intercettato e decidiamo noi cosa fare.
// ------------------------------------------------------------------

const MAIN_TABS = new Set(['/home', '/discover', '/for-you', '/swipe'])

function AndroidBackHandler() {
  const router      = useRouter()
  const pathnameRef = useRef<string>('')
  const pathname    = usePathname()
  pathnameRef.current = pathname

  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return

    // Inserisce il cuscinetto subito
    history.pushState({ gkCushion: true }, '')

    const handler = (e: PopStateEvent) => {
      e.stopImmediatePropagation()

      // Rimettiamo subito il cuscinetto per il prossimo back,
      // tranne nel caso 3 (home → esci)
      const reinsert = () => history.pushState({ gkCushion: true }, '')

      // 1. Drawer/modal aperto → chiudi
      if (androidBack.hasOpenLayer) {
        androidBack.handleBack()
        reinsert()
        return
      }

      const current = pathnameRef.current
      const isMainTab = MAIN_TABS.has(current) || current.startsWith('/profile/')

      // 2. Tab non-home → vai a /home
      if (isMainTab && current !== '/home' && current !== '/') {
        router.replace('/home')
        reinsert()
        return
      }

      // 3. Home (o pagina non gestita) → esci dall'app
      // Non rimettiamo il cuscinetto: il prossimo back esce davvero
      history.back()
    }

    window.addEventListener('popstate', handler, { capture: true })
    return () => window.removeEventListener('popstate', handler, { capture: true })
  }, [router]) // solo al mount — pathname letto dal ref

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