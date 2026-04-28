'use client'
// src/components/AppShell.tsx
// Wrapper che decide se montare SwipeablePageContainer + KeepAliveTabShell
// SOLO sulle route dell'app autenticata. Landing e auth vengono renderizzate
// direttamente senza il sistema di tab.

import { usePathname } from 'next/navigation'
import { SwipeablePageContainer } from '@/components/SwipeablePageContainer'
import { KeepAliveTabShell } from '@/components/KeepAliveTabShell'
import { MainShell } from '@/components/MainShell'
import type { ReactNode } from 'react'

// Route che NON devono usare il sistema di tab
const BYPASS_ROUTES = ['/', '/login', '/register', '/forgot-password', '/onboarding']

function isBypassRoute(pathname: string): boolean {
  if (BYPASS_ROUTES.includes(pathname)) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (isBypassRoute(pathname)) {
    // Landing e auth: renderizza direttamente, zero overhead di tab/swipe
    return <>{children}</>
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
