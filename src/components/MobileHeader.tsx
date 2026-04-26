'use client'
// MobileHeader — context-aware top bar per mobile.
// Feed: wordmark geekore + campanella
// Profilo proprio: username + edit + settings
// Profilo altrui: back + username
// Discover / For You / Trending / ...: icona colorata + titolo + campanella

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell, Settings, Edit3, ChevronLeft,
  Search, Sparkles, TrendingUp, Shuffle, Users,
  Bookmark, BarChart2, Trophy, List,
} from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { useState, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup']

function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      className="flex items-center justify-center w-10 h-10 -ml-2 text-[var(--text-primary)]"
      aria-label="Torna indietro"
    >
      <ChevronLeft size={28} strokeWidth={1.6} />
    </button>
  )
}

// Wordmark con dot gradient — identità visiva Geekore
function GeekoreWordmark() {
  return (
    <Link href="/home" className="flex items-center gap-1 py-1">
      <span
        className="text-[24px] font-bold text-white tracking-tight"
        style={{ letterSpacing: '-0.5px' }}
      >
        geekore
      </span>
      <span className="w-[7px] h-[7px] rounded-full mb-[1px] flex-shrink-0 bg-violet-500" />
    </Link>
  )
}

// Titolo pagina con icona colorata — uguale allo stile del bottom nav
interface PageTitleProps {
  title: string
  icon: ReactNode
  iconBg: string  // classe tailwind gradient o colore solido
}
function PageTitle({ title, icon, iconBg }: PageTitleProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <h1 className="text-[17px] font-semibold text-white tracking-tight">{title}</h1>
    </div>
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


  const isFeed      = pathname === '/home' || pathname === '/'
  const isOwnProfile  = pathname === '/profile/me' || (username && pathname === `/profile/${username}`)
  const isOtherProfile = isProfilePage && !isOwnProfile && pathname.split('/').length === 3
  const isSubPage   = (pathname.split('/').length > 3 && !isOtherProfile) ||
    pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

  const profileUsername = isProfilePage ? pathname.split('/')[2] : null

  const iconCls = 'w-10 h-10 flex items-center justify-center text-[var(--text-primary)] hover:opacity-70 transition-opacity'

  // Mappa pathname → config titolo con icona e colore
  const PAGE_CONFIG: Record<string, PageTitleProps> = {
    '/discover':     { title: t.nav.discover,       icon: <Search size={14} className="text-white" />,      iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600' },
    '/for-you':      { title: t.nav.forYou,          icon: <Sparkles size={14} className="text-white" />,    iconBg: 'bg-gradient-to-br from-violet-500 to-fuchsia-500' },
    '/trending':     { title: 'Trending',             icon: <TrendingUp size={14} className="text-white" />,  iconBg: 'bg-gradient-to-br from-orange-500 to-red-500' },
    '/swipe':        { title: 'Swipe',                icon: <Shuffle size={14} className="text-white" />,     iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
    '/notifications':{ title: 'Notifiche',            icon: <Bell size={14} className="text-white" />,        iconBg: 'bg-gradient-to-br from-amber-500 to-orange-500' },
    '/settings':     { title: t.nav.settings,         icon: <Settings size={14} className="text-white" />,    iconBg: 'bg-zinc-700' },
    '/wishlist':     { title: 'Wishlist',             icon: <Bookmark size={14} className="text-white" />,    iconBg: 'bg-gradient-to-br from-pink-500 to-rose-600' },
    '/stats':        { title: 'Statistiche',          icon: <BarChart2 size={14} className="text-white" />,   iconBg: 'bg-gradient-to-br from-indigo-500 to-violet-600' },
    '/leaderboard':  { title: 'Classifica',           icon: <Trophy size={14} className="text-white" />,      iconBg: 'bg-gradient-to-br from-yellow-500 to-amber-600' },
    '/lists':        { title: 'Liste',                icon: <List size={14} className="text-white" />,        iconBg: 'bg-gradient-to-br from-cyan-500 to-sky-600' },
    '/search':       { title: 'Cerca',                icon: <Search size={14} className="text-white" />,      iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600' },
    '/explore':      { title: 'Esplora',              icon: <Search size={14} className="text-white" />,      iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600' },
    '/community':    { title: 'Community',            icon: <Users size={14} className="text-white" />,       iconBg: 'bg-gradient-to-br from-violet-500 to-fuchsia-500' },
  }

  const pageConfig = Object.entries(PAGE_CONFIG).find(
    ([k]) => pathname === k || pathname.startsWith(k + '/')
  )?.[1]

  // -- Rendering --

  const renderLeft = () => {
    if (isSubPage) return <BackButton />
    if (isFeed)    return <GeekoreWordmark />
    if (isOwnProfile) return (
      <div className="flex items-center gap-1.5">
        <span className="text-[17px] font-semibold text-white tracking-tight">
          {username || 'Profilo'}
        </span>
      </div>
    )
    if (isOtherProfile && profileUsername && profileUsername !== 'me') return (
      <div className="flex items-center gap-1.5">
        <ChevronLeft size={26} strokeWidth={1.6} className="text-[var(--text-primary)] -ml-1 cursor-pointer" onClick={() => window.history.back()} />
        <h1 className="text-[16px] font-semibold text-white truncate">{profileUsername}</h1>
      </div>
    )
    if (pageConfig) return (
      <div className="flex items-center gap-2">
        {isSubPage && <BackButton />}
        <PageTitle {...pageConfig} />
      </div>
    )
    // Fallback generico con back button
    return (
      <div className="flex items-center gap-2">
        <BackButton />
      </div>
    )
  }

  const renderRight = () => {
    if (isFeed) return (
      <Link href="/notifications" className={`${iconCls} relative`} onClick={() => setUnread(false)} aria-label="Notifiche">
        <Bell size={23} strokeWidth={1.6} />
        {unread && (
          <span className="absolute top-2.5 right-2 w-[8px] h-[8px] bg-red-500 rounded-full border-[1.5px] border-black notif-badge-pulse" />
        )}
      </Link>
    )
    if (isOwnProfile) return (
      <>
        <Link href="/profile/edit" className={iconCls} aria-label="Modifica profilo">
          <Edit3 size={21} strokeWidth={1.6} />
        </Link>
        <Link href="/settings" className={iconCls} aria-label="Impostazioni">
          <Settings size={21} strokeWidth={1.6} />
        </Link>
      </>
    )
    if (pathname === '/notifications') return null
    return (
      <Link href="/notifications" className={`${iconCls} relative`} onClick={() => setUnread(false)} aria-label="Notifiche">
        <Bell size={23} strokeWidth={1.6} />
        {unread && <span className="absolute top-2.5 right-2 w-[8px] h-[8px] bg-red-500 rounded-full border-[1.5px] border-black" />}
      </Link>
    )
  }

  const isSwipePage = pathname === '/swipe'

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-[99] bg-black swipe-header"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        visibility: isSwipePage ? 'hidden' : 'visible',
        pointerEvents: isSwipePage ? 'none' : 'auto',
      }}
      aria-hidden={isSwipePage}
    >
      <div className="flex items-center justify-between h-[52px] px-3">
        <div className="flex items-center flex-1 min-w-0">
          {renderLeft()}
        </div>
        <div className="flex items-center flex-shrink-0">
          {renderRight()}
        </div>
      </div>
      {/* Separatore ultra-sottile */}
      <div className="h-[0.5px] bg-[var(--border)]" />
    </header>
  )
}