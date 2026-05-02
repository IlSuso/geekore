'use client'

import { usePathname } from 'next/navigation'
import { ForYouModeSwitch } from '@/components/for-you/ForYouModeSwitch'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/']

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))
  const showForYouSwitch = pathname === '/swipe'
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
      <div className={pageSurface ? 'gk-page-shell' : undefined}>
        {children}
      </div>
    </main>
  )
}
