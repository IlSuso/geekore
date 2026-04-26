'use client'
import { usePathname } from 'next/navigation'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/']

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))
  return (
    <main data-auth={isAuth ? 'true' : undefined}>
      {children}
    </main>
  )
}
