'use client'
// src/components/AppShell.tsx
// Wrapper che decide quando montare SwipeablePageContainer + KeepAliveTabShell.
// Il sistema keep-alive deve esistere SOLO sulle route-tab principali.
// Visione visiva: Swipe non è più una tab primaria, resta una modalità di For You.

import { usePathname } from 'next/navigation'
import { SwipeablePageContainer } from '@/components/SwipeablePageContainer'
import { KeepAliveTabShell } from '@/components/KeepAliveTabShell'
import { MainShell } from '@/components/MainShell'
import type { ReactNode } from 'react'

const BYPASS_ROUTES = ['/', '/login', '/register', '/forgot-password', '/onboarding']
const KEEP_ALIVE_TAB_ROUTES = new Set(['/home', '/for-you', '/library', '/discover', '/friends', '/community'])

function isBypassRoute(pathname: string): boolean {
  if (BYPASS_ROUTES.includes(pathname)) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

function isKeepAliveTabRoute(pathname: string): boolean {
  return KEEP_ALIVE_TAB_ROUTES.has(pathname)
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (isBypassRoute(pathname)) {
    return <>{children}</>
  }

  // /swipe remains a full-screen child mode launched from For You, not a primary tab.
  if (pathname === '/swipe') {
    return <MainShell>{children}</MainShell>
  }

  if (!isKeepAliveTabRoute(pathname)) {
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
