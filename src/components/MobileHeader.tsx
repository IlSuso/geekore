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
  Search, Sparkles, TrendingUp, Users,
  Bookmark, BarChart2, Trophy, List, Library,
} from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { useState, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { MobileNotificationsDrawer } from '@/components/feed/MobileNotificationsDrawer'

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

// Wordmark — identità visiva Geekore
function GeekoreWordmark() {
  return (
    <Link href="/home" className="flex items-center gap-[3px] py-1">
      <span
        className="text-[24px] font-bold text-white font-display"
        style={{ letterSpacing: '-0.03em' }}
      >
        geekore
      </span>
      <span
        className="flex-shrink-0 mb-[2px]"
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: '#E6FF3D',
          display: 'inline-block',
        }}
      />
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
  const [notifOpen, setNotifOpen] = useState(false)
  // mounted evita hydration mismatch: sul server username è sempre null,
  // quindi isOwnProfile è sempre false. Prima che il client risolva l'utente
  // usiamo la stessa logica del server (mounted=false → isOwnProfile=false).
  const [mounted, setMounted] = useState(false)
  const isProfilePage = pathname.startsWith('/profile/')

  // PERF FIX: usa AuthContext invece di getUser() per-componente
  const authUser = useUser()
  useEffect(() => {
    setMounted(true)
    if (!authUser) return
    const supabase = createClient()
    supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', authUser.id).eq('is_read', false)
      .then(({ count }) => { if (count && count > 0) setUnread(true) })
    if (isProfilePage) {
      supabase.from('profiles').select('username').eq('id', authUser.id).single()
        .then(({ data }) => { if (data) setUsername(data.username) })
    }
  }, [authUser, pathname]) // eslint-disable-line

  if (pathname === '/' || AUTH_PATHS.some(p => pathname.startsWith(p))) return null

  const isFeed        = pathname === '/home'
  // isOwnProfile dipende da username (auth) — usare solo dopo il mount
  // per evitare divergenza SSR/client.
  const isOwnProfile  = mounted && (pathname === '/profile/me' || (username && pathname === `/profile/${username}`))
  const PROFILE_RESERVED = new Set(['edit', 'setup', 'me', 'loading'])
  const isOtherProfile = isProfilePage && !isOwnProfile && pathname.split('/').length === 3 && !PROFILE_RESERVED.has(pathname.split('/')[2] || '')
  const isSubPage     = (pathname.split('/').length > 3 && !isOtherProfile) ||
    pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

  const profileUsername = isProfilePage ? pathname.split('/')[2] : null

  const iconCls = 'w-10 h-10 flex items-center justify-center text-[var(--text-primary)] hover:opacity-70 transition-opacity'

  // Mappa pathname → config titolo con icona e colore.
  // Sistema: grigio per pagine di sistema, viola brand per funzioni core.
  // Nessun gradiente casuale — coerenza prima di tutto.
  const PAGE_CONFIG: Record<string, PageTitleProps> = {
    '/discover':      { title: t.nav.discover,      icon: <Search size={14} className="text-white" />,     iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/for-you':       { title: t.nav.forYou,         icon: <Sparkles size={14} className="text-white" />,   iconBg: 'bg-violet-600' },
    '/trending':      { title: 'Trending',            icon: <TrendingUp size={14} className="text-white" />, iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/swipe':         { title: 'Swipe',               icon: <Shuffle size={14} className="text-white" />,    iconBg: 'bg-violet-600' },
    '/notifications': { title: 'Notifiche',           icon: <Bell size={14} className="text-zinc-400" />,    iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/settings':      { title: t.nav.settings,        icon: <Settings size={14} className="text-zinc-400" />,iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/settings/profile': { title: 'Modifica Profilo', icon: <Edit3 size={14} className="text-white" />,      iconBg: 'bg-violet-600' },
    '/profile/setup': { title: 'Crea Profilo',        icon: <Edit3 size={14} className="text-white" />,      iconBg: 'bg-violet-600' },
    '/wishlist':      { title: 'Wishlist',            icon: <Bookmark size={14} className="text-zinc-400" />,iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/stats':         { title: 'Statistiche',         icon: <BarChart2 size={14} className="text-zinc-400" />,iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/leaderboard':   { title: 'Classifica',          icon: <Trophy size={14} className="text-zinc-400" />,  iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/lists':         { title: 'Liste',               icon: <List size={14} className="text-zinc-400" />,    iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/search':        { title: 'Cerca',               icon: <Search size={14} className="text-zinc-400" />,  iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/explore':       { title: 'Esplora',             icon: <Search size={14} className="text-zinc-400" />,   iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
    '/community':     { title: 'Community',           icon: <Users size={14} className="text-white" />,       iconBg: 'bg-violet-600' },
    '/library':       { title: 'Libreria',            icon: <Library size={14} className="text-white" />,     iconBg: 'bg-[#1C1C26] border border-[#2A2A36]' },
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
        {(isSubPage || pathname === '/settings/profile' || pathname === '/profile/setup') && <BackButton />}
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

  const openNotif = () => { setUnread(false); setNotifOpen(true) }

  const renderRight = () => {
    if (isFeed) return (
      <button onClick={openNotif} className={`${iconCls} relative`} aria-label="Notifiche">
        <Bell size={23} strokeWidth={1.6} />
        {unread && (
          <span className="absolute top-2.5 right-2 w-[8px] h-[8px] bg-red-500 rounded-full border-[1.5px] border-black notif-badge-pulse" />
        )}
      </button>
    )
    if (isOwnProfile) return (
      <>
        <Link href="/settings/profile" className={iconCls} aria-label="Modifica profilo">
          <Edit3 size={21} strokeWidth={1.6} />
        </Link>
        <Link href="/settings" className={iconCls} aria-label="Impostazioni">
          <Settings size={21} strokeWidth={1.6} />
        </Link>
      </>
    )
    if (pathname === '/notifications') return null
    return (
      <button onClick={openNotif} className={`${iconCls} relative`} aria-label="Notifiche">
        <Bell size={23} strokeWidth={1.6} />
        {unread && <span className="absolute top-2.5 right-2 w-[8px] h-[8px] bg-red-500 rounded-full border-[1.5px] border-black" />}
      </button>
    )
  }

  const isSwipePage = pathname === '/swipe'

  return (
    <>
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

    <MobileNotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}