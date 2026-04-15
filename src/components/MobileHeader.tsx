'use client'
// MobileHeader — stile Instagram: header fisso, solo su mobile.
// Feed: logo + cerca + notifiche (con badge)
// Pagine interne: ← + titolo + eventuale azione destra
// Niente border-b visibile (solo 1px nero che separa dallo sfondo)

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Bell, Search, Settings, Edit3 } from 'lucide-react'
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

  const [username, setUsername] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const isProfilePage = pathname.startsWith('/profile/')

  // Dati utente per header profilo + badge notifiche
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      if (pathname === '/feed' || pathname === '/') {
        supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id).eq('is_read', false)
          .then(({ count }) => { if (count && count > 0) setUnread(true) })
      }
      if (isProfilePage) {
        supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single()
          .then(({ data }) => { if (data) { setUsername(data.username); setAvatarUrl(data.avatar_url) } })
      }
    })
  }, [pathname])

  if (AUTH_PATHS.some(p => pathname.startsWith(p))) return null

  const isFeed = pathname === '/feed' || pathname === '/'
  const isOwnProfile = pathname === '/profile/me' || (username && pathname === `/profile/${username}`)
  const isOtherProfile = isProfilePage && !isOwnProfile && pathname.split('/').length === 3
  const isSubPage = (pathname.split('/').length > 3 && !isOtherProfile) ||
    pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

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

  // Estrai username dalla URL per profili altrui
  const profileUsername = isProfilePage ? pathname.split('/')[2] : null

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
          ) : isOwnProfile ? (
            <h1 className="text-[17px] font-semibold text-white tracking-tight">Profilo</h1>
          ) : isOtherProfile && profileUsername ? (
            <h1 className="text-[17px] font-semibold text-white tracking-tight truncate">@{profileUsername}</h1>
          ) : (
            <h1 className="text-[17px] font-semibold text-white tracking-tight truncate">{title}</h1>
          )}
        </div>

        {/* Destra contestuale per sezione */}
        {isFeed && (
          <div className="flex items-center gap-1">
            <Link href="/discover" className="w-10 h-10 flex items-center justify-center text-white">
              <Search size={23} strokeWidth={1.8} />
            </Link>
            <Link href="/notifications" className="w-10 h-10 flex items-center justify-center text-white relative"
              onClick={() => setUnread(false)}>
              <Bell size={23} strokeWidth={1.8} />
              {unread && <span className="absolute top-2 right-2 w-[9px] h-[9px] bg-red-500 rounded-full border-[1.5px] border-black" />}
            </Link>
          </div>
        )}
        {(isOwnProfile || isOtherProfile) && (
          <div className="flex items-center gap-1">
            {isOwnProfile && (
              <Link href="/profile/edit" className="w-10 h-10 flex items-center justify-center text-white">
                <Edit3 size={21} strokeWidth={1.8} />
              </Link>
            )}
            {isOwnProfile && (
              <Link href="/settings" className="w-10 h-10 flex items-center justify-center text-white">
                <Settings size={21} strokeWidth={1.8} />
              </Link>
            )}
          </div>
        )}

      </div>
    </header>
  )
}