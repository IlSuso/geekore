'use client'
// src/components/MobileHeader.tsx
// Header mobile fisso in cima — stile Instagram/app nativa.
// Mostra logo/titolo a sinistra e azioni contestuali a destra.
// Visibile SOLO su mobile (md:hidden). Su desktop c'è la Navbar.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Bell, Search, Settings, ArrowLeft, Bookmark } from 'lucide-react'
import { useLocale } from '@/lib/locale'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup']

// Mappa path → { titolo, mostraLogo, azioniDestra }
function useHeaderConfig(pathname: string) {
  const { t } = useLocale()

  if (pathname === '/feed' || pathname === '/') return {
    logo: true,
    title: null,
    right: [
      { icon: Search, href: '/discover', label: 'Cerca' },
      { icon: Bell, href: '/notifications', label: 'Notifiche' },
    ],
  }
  if (pathname === '/discover') return {
    logo: false, title: t.nav.discover,
    right: [],
  }
  if (pathname === '/for-you') return {
    logo: false, title: t.nav.forYou,
    right: [],
  }
  if (pathname === '/notifications') return {
    logo: false, title: t.nav.notifications,
    right: [],
  }
  if (pathname.startsWith('/profile')) return {
    logo: false, title: null, // il nome utente è nel profilo stesso
    right: pathname.includes('/me') || !pathname.includes('/[') ? [
      { icon: Bookmark, href: '/wishlist', label: 'Wishlist' },
      { icon: Settings, href: '/settings', label: 'Impostazioni' },
    ] : [],
  }
  if (pathname === '/settings') return {
    logo: false, title: t.nav.settings,
    right: [],
  }
  if (pathname === '/trending') return {
    logo: false, title: 'Trending',
    right: [],
  }
  if (pathname === '/explore' || pathname === '/search') return {
    logo: false, title: t.nav.search,
    right: [],
  }
  if (pathname === '/stats') return {
    logo: false, title: 'Stats',
    right: [],
  }
  if (pathname === '/wishlist') return {
    logo: false, title: 'Wishlist',
    right: [],
  }
  if (pathname === '/leaderboard') return {
    logo: false, title: 'Leaderboard',
    right: [],
  }
  if (pathname.startsWith('/lists')) return {
    logo: false, title: 'Liste',
    right: [],
  }
  if (pathname === '/news') return {
    logo: false, title: 'News',
    right: [],
  }

  // Default fallback
  return { logo: true, title: null, right: [] }
}

export function MobileHeader() {
  const pathname = usePathname()
  const { t } = useLocale()

  // Non mostrare su pagine auth/onboarding
  if (AUTH_PATHS.some(p => pathname.startsWith(p))) return null
  if (pathname === '/') return null

  const config = useHeaderConfig(pathname)

  // Pagine con back button (sotto-pagine profilo)
  const isSubPage = (
    (pathname.startsWith('/profile/') && pathname !== '/profile/me' && pathname.split('/').length > 3) ||
    pathname.startsWith('/stats/') ||
    pathname.startsWith('/lists/')
  )

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-[99] bg-black/95 backdrop-blur-xl border-b border-zinc-900"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between h-14 px-4">

        {/* Sinistra: logo o back o titolo */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isSubPage ? (
            <button onClick={() => window.history.back()}
              className="flex items-center gap-1 text-white -ml-1 p-1">
              <ArrowLeft size={22} />
            </button>
          ) : config.logo ? (
            <Link href="/feed" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Zap size={14} className="text-white" />
              </div>
              <span className="text-lg font-bold tracking-tighter text-white">geekore</span>
            </Link>
          ) : config.title ? (
            <h1 className="text-lg font-bold text-white truncate">{config.title}</h1>
          ) : null}
        </div>

        {/* Destra: azioni contestuali */}
        {config.right.length > 0 && (
          <div className="flex items-center gap-1">
            {config.right.map(({ icon: Icon, href, label }) => (
              <Link key={href} href={href}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white transition-colors"
                aria-label={label}>
                <Icon size={22} strokeWidth={1.8} />
              </Link>
            ))}
          </div>
        )}

      </div>
    </header>
  )
}