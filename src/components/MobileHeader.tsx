'use client'
// MobileHeader — Instagram-style: wordmark on feed, back arrow on inner pages.
// Edge-to-edge, no visible border, clean black bg.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Search, Settings, Edit3, ChevronLeft } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup']

function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      className="flex items-center justify-center w-10 h-10 -ml-2 text-[var(--text-primary)]"
    >
      <ChevronLeft size={28} strokeWidth={1.6} />
    </button>
  )
}

// Instagram-style wordmark with gradient dot
function GeekoreWordmark() {
  return (
    <Link href="/feed" className="flex items-center gap-1 py-1 group">
      <span
        className="text-[24px] font-bold text-white tracking-tight"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif', letterSpacing: '-0.5px' }}
      >
        geekore
      </span>
      {/* Instagram-style gradient dot */}
      <span
        className="w-[7px] h-[7px] rounded-full mb-[1px] flex-shrink-0 bg-violet-500"
      />
    </Link>
  )
}

export function MobileHeader() {
  const pathname = usePathname()
  const { t } = useLocale()
  const [unread, setUnread] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const isProfilePage = pathname.startsWith('/profile/')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id).eq('is_read', false)
        .then(({ count }) => { if (count && count > 0) setUnread(true) })
      if (isProfilePage) {
        supabase.from('profiles').select('username').eq('id', user.id).single()
          .then(({ data }) => { if (data) setUsername(data.username) })
      }
    })
  }, [pathname])

  if (AUTH_PATHS.some(p => pathname.startsWith(p))) return null

  const isFeed = pathname === '/feed' || pathname === '/'
  const isOwnProfile = pathname === '/profile/me' || (username && pathname === `/profile/${username}`)
  const isOtherProfile = isProfilePage && !isOwnProfile && pathname.split('/').length === 3
  const isSubPage = (pathname.split('/').length > 3 && !isOtherProfile) ||
    pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

  const titles: Record<string, string> = {
    '/discover': 'Cerca',
    '/for-you': 'Per te',
    '/notifications': 'Notifiche',
    '/settings': 'Impostazioni',
    '/trending': 'Trending',
    '/explore': 'Esplora',
    '/search': 'Cerca',
    '/stats': 'Statistiche',
    '/wishlist': 'Wishlist',
    '/leaderboard': 'Classifica',
    '/lists': 'Liste',
    '/news': 'News',
  }

  const title = Object.entries(titles).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1]
  const profileUsername = isProfilePage ? pathname.split('/')[2] : null

  const iconCls = "w-10 h-10 flex items-center justify-center text-[var(--text-primary)] hover:opacity-70 transition-opacity"

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-[99] bg-black"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between h-[52px] px-3">

        {/* Left */}
        <div className="flex items-center flex-1 min-w-0">
          {isSubPage ? (
            <BackButton />
          ) : isFeed ? (
            <GeekoreWordmark />
          ) : isOwnProfile ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[17px] font-semibold text-white tracking-tight">
                {username || 'Profilo'}
              </span>
              {/* small lock icon for private feel */}

            </div>
          ) : isOtherProfile && profileUsername && profileUsername !== 'me' ? (
            <div className="flex items-center gap-2">
              <ChevronLeft
                size={26}
                strokeWidth={1.6}
                className="text-[var(--text-primary)] -ml-1 cursor-pointer"
                onClick={() => window.history.back()}
              />
              <h1 className="text-[16px] font-semibold text-white truncate">{profileUsername}</h1>
            </div>
          ) : pathname === '/notifications' ? (
            <div className="flex items-center gap-2">
              <ChevronLeft
                size={26}
                strokeWidth={1.6}
                className="text-[var(--text-primary)] -ml-1 cursor-pointer"
                onClick={() => window.history.back()}
              />
              <h1 className="text-[17px] font-semibold text-white">Notifiche</h1>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isSubPage && <BackButton />}
              <h1 className="text-[17px] font-semibold text-white truncate">{title}</h1>
            </div>
          )}
        </div>

        {/* Right — contextual actions */}
        <div className="flex items-center">
          {isFeed && (
            <>
              <Link
                href="/notifications"
                className={`${iconCls} relative`}
                onClick={() => setUnread(false)}
              >
                <Bell size={24} strokeWidth={1.6} />
                {unread && (
                  <span className="absolute top-2.5 right-2 w-[9px] h-[9px] bg-red-500 rounded-full border-[1.5px] border-black notif-badge-pulse" />
                )}
              </Link>
            </>
          )}

          {isOwnProfile && (
            <>
              <Link href="/profile/edit" className={iconCls}>
                <Edit3 size={22} strokeWidth={1.6} />
              </Link>
              <Link href="/settings" className={iconCls}>
                <Settings size={22} strokeWidth={1.6} />
              </Link>
            </>
          )}

          {!isFeed && !isOwnProfile && !isOtherProfile && pathname !== '/notifications' && (
            <Link href="/notifications" className={`${iconCls} relative`} onClick={() => setUnread(false)}>
              <Bell size={24} strokeWidth={1.6} />
              {unread && <span className="absolute top-2.5 right-2 w-[9px] h-[9px] bg-red-500 rounded-full border-[1.5px] border-black" />}
            </Link>
          )}

          {/* nessuna azione destra su /notifications */}
        </div>

      </div>

      {/* Ultra-thin separator — barely visible, like Instagram */}
      <div className="h-[0.5px] bg-[var(--border)]" />
    </header>
  )
}