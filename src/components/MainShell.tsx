'use client'

import { usePathname } from 'next/navigation'
import { ForYouModeSwitch } from '@/components/for-you/ForYouModeSwitch'
import { DiscoverQuickLinks } from '@/components/discover/DiscoverQuickLinks'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/']

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))
  const showForYouSwitch = pathname === '/for-you' || pathname === '/swipe'
  const showDiscoverQuickLinks = pathname === '/discover'

  return (
    <main data-auth={isAuth ? 'true' : undefined}>
      {showForYouSwitch && (
        <div className="fixed right-4 top-[calc(3.75rem+env(safe-area-inset-top,0px))] z-[95] md:top-16">
          <ForYouModeSwitch active={pathname === '/swipe' ? 'swipe' : 'list'} />
        </div>
      )}
      {showDiscoverQuickLinks && (
        <div className="fixed left-1/2 top-16 z-[95] hidden -translate-x-1/2 md:block">
          <DiscoverQuickLinks />
        </div>
      )}
      {children}
    </main>
  )
}
