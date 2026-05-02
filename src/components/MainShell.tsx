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
  const pageSurface = !isAuth && pathname !== '/swipe'

  return (
    <main
      data-auth={isAuth ? 'true' : undefined}
      className={pageSurface ? 'gk-app-main' : undefined}
    >
      {showForYouSwitch && (
        <div
          data-no-swipe="true"
          data-interactive="true"
          className="pointer-events-none fixed right-4 top-[calc(3.75rem+env(safe-area-inset-top,0px))] z-[95] md:top-4 md:right-6"
        >
          <div className="pointer-events-auto" data-no-swipe="true">
            <ForYouModeSwitch active={pathname === '/swipe' ? 'swipe' : 'list'} />
          </div>
        </div>
      )}
      {showDiscoverQuickLinks && (
        <div
          data-no-swipe="true"
          data-interactive="true"
          className="pointer-events-none fixed left-2 right-2 top-[calc(3.65rem+env(safe-area-inset-top,0px))] z-[95] md:left-[calc(var(--desktop-sidebar-w)+24px)] md:right-6 md:top-4 md:translate-x-0"
        >
          <div className="pointer-events-auto" data-no-swipe="true">
            <DiscoverQuickLinks />
          </div>
        </div>
      )}
      <div className={pageSurface ? 'gk-page-shell' : undefined}>
        {children}
      </div>
    </main>
  )
}
