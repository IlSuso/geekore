'use client'
// src/components/AppShell.tsx
// Wrapper che decide quando montare SwipeablePageContainer + KeepAliveTabShell.
// Il sistema keep-alive deve esistere SOLO sulle route-tab principali; sulle
// pagine normali (/settings, /wishlist, /stats, ecc.) deve renderizzare i
// children reali di Next.js, altrimenti il tab attivo resta sopra la pagina.

import { usePathname } from 'next/navigation'
import { SwipeablePageContainer } from '@/components/SwipeablePageContainer'
import { KeepAliveTabShell } from '@/components/KeepAliveTabShell'
import { MainShell } from '@/components/MainShell'
import type { ReactNode } from 'react'

// Route che NON devono usare nemmeno il MainShell dell'app autenticata.
const BYPASS_ROUTES = ['/', '/login', '/register', '/forgot-password', '/onboarding']

function isBypassRoute(pathname: string): boolean {
  if (BYPASS_ROUTES.includes(pathname)) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

function isKeepAliveTabRoute(pathname: string): boolean {
  if (
    pathname === '/home' ||
    pathname === '/discover' ||
    pathname === '/for-you' ||
    pathname === '/swipe' ||
    pathname === '/library'
  ) {
    return true
  }

  // Solo la pagina profilo principale è un tab keep-alive.
  // Sottopagine tipo /profile/edoardo/film devono usare il render normale Next.
  if (pathname.startsWith('/profile/')) {
    return pathname.split('/').length === 3
  }

  return false
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (isBypassRoute(pathname)) {
    // Landing e auth: renderizza direttamente, zero overhead di tab/swipe.
    return <>{children}</>
  }

  if (!isKeepAliveTabRoute(pathname)) {
    // Pagine app normali: settings, wishlist, stats, lists, notifications, ecc.
    // Devono poter fare routing reale e non restare coperte dal pannello keep-alive.
    return <MainShell>{children}</MainShell>
  }

  return (
    <SwipeablePageContainer>
      <MainShell>
        <KeepAliveTabShell>
          {children}
        </KeepAliveTabShell>
      </MainShell>
    </SwipeablePageContainer>
  )
}
