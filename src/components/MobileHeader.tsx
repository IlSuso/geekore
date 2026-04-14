'use client'
// MobileHeader — stile Instagram: header fisso, solo su mobile.
// Feed: logo + cerca + notifiche (con badge)
// Pagine interne: ← + titolo + eventuale azione destra
// Niente border-b visibile (solo 1px nero che separa dallo sfondo)

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Bell, Search } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup']

function BackButton() {
  return (
    <button onClick={() => window.history.back()}
      className="flex items-center justify-center w-10 h-10 -ml-2 text-white">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  )
}

export function MobileHeader() {
  const pathname = usePathname()
  const { t } = useLocale()
  const [unread, setUnread] = useState(false)

  // Badge notifiche
  useEffect(() => {
    if (pathname === '/feed' || pathname === '/') {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('is_read', false)
          .then(({ count }) => { if (count && count > 0) setUnread(true) })
      })
    }
  }, [pathname])

  if (AUTH_PATHS.some(p => pathname.startsWith(p))) return null

  const isFeed = pathname === '/feed' || pathname === '/'
  const isSubPage = pathname.split('/').length > 3 ||
    (pathname.startsWith('/stats/') || pathname.startsWith('/lists/'))

  // Titolo per pagine interne
  const titles: Record<string, string> = {
    '/discover': t.nav.discover,
    '/for-you': t.nav.forYou,
    '/notifications': 'Notifiche',
    '/settings': 'Impostazioni',
    '/trending': 'Trending',
    '/explore': 'Esplora',
    '/search': 'Cerca',
    '/stats': 'Stats',
    '/wishlist': 'Wishlist',
    '/leaderboard': 'Leaderboard',
    '/lists': 'Liste',
    '/news': 'News',
  }

  const title = Object.entries(titles).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1]

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-[99] bg-black"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between h-[52px] px-3">

        {/* Sinistra */}
        <div className="flex items-center flex-1 min-w-0">
          {isSubPage ? (
            <BackButton />
          ) : isFeed ? (
            <Link href="/feed" className="flex items-center gap-2 py-1">
              <div className="w-[26px] h-[26px] bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
                <Zap size={13} className="text-white" />
              </div>
              <span className="text-[19px] font-bold tracking-tight text-white" style={{fontFamily:'system-ui,-apple-system,sans-serif'}}>
                geekore
              </span>
            </Link>
          ) : (
            <h1 className="text-[17px] font-semibold text-white tracking-tight truncate">{title}</h1>
          )}
        </div>

        {/* Destra — solo su feed */}
        {isFeed && (
          <div className="flex items-center gap-1">
            <Link href="/discover"
              className="w-10 h-10 flex items-center justify-center text-white">
              <Search size={23} strokeWidth={1.8} />
            </Link>
            <Link href="/notifications"
              className="w-10 h-10 flex items-center justify-center text-white relative"
              onClick={() => setUnread(false)}>
              <Bell size={23} strokeWidth={1.8} />
              {unread && (
                <span className="absolute top-2 right-2 w-[9px] h-[9px] bg-red-500 rounded-full border-[1.5px] border-black" />
              )}
            </Link>
          </div>
        )}

      </div>
    </header>
  )
}
