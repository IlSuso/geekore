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
// DEBUG: overlay visivo per vedere cosa arriva dalla Navigation API
// RIMUOVERE dopo il debug!
// ------------------------------------------------------------------
function NavDebugOverlay() {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return
    const nav = (window as any).navigation
    if (!nav) return

    const addLog = (msg: string) => {
      if (!logRef.current) return
      const line = document.createElement('div')
      line.textContent = `${new Date().toISOString().slice(11,19)} ${msg}`
      logRef.current.prepend(line)
      // Tieni solo gli ultimi 8 log
      while (logRef.current.children.length > 8) {
        logRef.current.removeChild(logRef.current.lastChild!)
      }
    }

    // Log TUTTI gli eventi navigate senza filtrare
    const handler = (e: any) => {
      addLog(`type=${e.navigationType} dest=${e.destination?.url?.replace(location.origin,'')} canIntercept=${e.canIntercept}`)
    }
    nav.addEventListener('navigate', handler)

    // Log anche popstate come confronto
    const popHandler = () => addLog(`POPSTATE state=${JSON.stringify(history.state)}`)
    window.addEventListener('popstate', popHandler)

    return () => {
      nav.removeEventListener('navigate', handler)
      window.removeEventListener('popstate', popHandler)
    }
  }, [])

  return (
    <div
      ref={logRef}
      style={{
        position: 'fixed', bottom: 80, left: 0, right: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.85)', color: '#0f0', fontSize: 10,
        fontFamily: 'monospace', padding: 4, pointerEvents: 'none',
        maxHeight: 160, overflow: 'hidden',
      }}
    />
  )
}

const MAIN_TABS = new Set(['/home', '/discover', '/for-you', '/swipe'])

function AndroidBackHandler() {
  const router = useRouter()
  const pathnameRef = useRef<string>('')
  const pathname = usePathname()
  pathnameRef.current = pathname

  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return
    const nav = (window as any).navigation
    if (!nav) return

    const handleNavigate = (e: any) => {
      if (e.navigationType !== 'traverse') return

      const current = pathnameRef.current

      if (androidBack.hasOpenLayer) {
        e.intercept({ handler: async () => { androidBack.handleBack() } })
        return
      }

      const isMainTab = MAIN_TABS.has(current) || current.startsWith('/profile/')
      if (isMainTab && current !== '/home' && current !== '/') {
        e.intercept({ handler: async () => { router.replace('/home') } })
        return
      }
    }

    nav.addEventListener('navigate', handleNavigate)
    return () => nav.removeEventListener('navigate', handleNavigate)
  }, [router])

  return null
}

export function ClientProviders({ children, initialLocale = 'it' }: { children: React.ReactNode; initialLocale?: 'it' | 'en' }) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={initialLocale}>
        <ThemeColorEnforcer />
        <AndroidBackHandler />
        <NavDebugOverlay />
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