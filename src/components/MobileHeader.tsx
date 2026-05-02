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
  Search, Sparkles, TrendingUp, Users, Shuffle,
  Bookmark, BarChart2, Trophy, List, Library,
} from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { useState, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { MobileNotificationsDrawer } from '@/components/feed/MobileNotificationsDrawer'
import { GeekoreWordmark } from '@/components/ui/GeekoreWordmark'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup']

function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      className="-ml-2 flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
      aria-label="Torna indietro"
    >
      <ChevronLeft size={27} strokeWidth={1.75} />
    </button>
  )
}

interface PageTitleProps {
  title: string
  icon: ReactNode
  iconBg: string
  iconStyle?: React.CSSProperties
}

function PageTitle({ title, icon, iconBg, iconStyle }: PageTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5 ${iconBg}`}
        style={iconStyle}
      >
        {icon}
      </div>
      <h1 className="truncate text-[17px] font-black tracking-tight text-[var(--text-primary)]">{title}</h1>
    </div>
  )
}

export function MobileHeader() {
  const pathname = usePathname()
  const { t } = useLocale()
  const [unread, setUnread] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const isProfilePage = pathname.startsWith('/profile/')

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

  const isFeed = pathname === '/home'
  const isOwnProfile = mounted && (pathname === '/profile/me' || (username && pathname === `/profile/${username}`))
  const PROFILE_RESERVED = new Set(['edit', 'setup', 'me', 'loading'])
  const profileParts = pathname.split('/')
  const profileUsername = isProfilePage ? profileParts[2] : null
  const isOtherProfile = isProfilePage && !isOwnProfile && profileParts.length === 3 && !PROFILE_RESERVED.has(profileUsername || '')
  const isSubPage = (profileParts.length > 3 && !isOtherProfile) || pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

  const iconCls = 'flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]'

  const PAGE_CONFIG: Record<string, PageTitleProps> = {
    '/discover': { title: t.nav.discover, icon: <Search size={14} className="text-white" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/for-you': { title: t.nav.forYou, icon: <Sparkles size={14} className="text-black" />, iconBg: '', iconStyle: { background: 'var(--accent)' } },
    '/trending': { title: 'Trending', icon: <TrendingUp size={14} className="text-white" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/swipe': { title: 'Swipe', icon: <Shuffle size={14} className="text-black" />, iconBg: '', iconStyle: { background: 'var(--accent)' } },
    '/notifications': { title: 'Notifiche', icon: <Bell size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/settings/profile': { title: 'Modifica Profilo', icon: <Edit3 size={14} className="text-black" />, iconBg: '', iconStyle: { background: 'var(--accent)' } },
    '/settings': { title: t.nav.settings, icon: <Settings size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/profile/setup': { title: 'Crea Profilo', icon: <Edit3 size={14} className="text-black" />, iconBg: '', iconStyle: { background: 'var(--accent)' } },
    '/wishlist': { title: 'Wishlist', icon: <Bookmark size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/stats': { title: 'Statistiche', icon: <BarChart2 size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/leaderboard': { title: 'Classifica', icon: <Trophy size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/lists': { title: 'Liste', icon: <List size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/search': { title: 'Cerca', icon: <Search size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/explore': { title: 'Esplora', icon: <Search size={14} className="text-[var(--text-muted)]" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
    '/friends': { title: 'Friends', icon: <Users size={14} className="text-black" />, iconBg: '', iconStyle: { background: 'var(--accent)' } },
    '/community': { title: 'Friends', icon: <Users size={14} className="text-black" />, iconBg: '', iconStyle: { background: 'var(--accent)' } },
    '/library': { title: 'Library', icon: <Library size={14} className="text-white" />, iconBg: 'bg-[var(--bg-card)] border border-[var(--border)]' },
  }

  const pageConfig = Object.entries(PAGE_CONFIG)
    .sort(([a], [b]) => b.length - a.length)
    .find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1]

  const renderLeft = () => {
    if (isSubPage) return <BackButton />
    if (isFeed) return <GeekoreWordmark size="md" />
    if (isOwnProfile) return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[17px] font-black tracking-tight text-[var(--text-primary)]">
          {username || 'Profilo'}
        </span>
      </div>
    )
    if (isOtherProfile && profileUsername && profileUsername !== 'me') return (
      <div className="flex min-w-0 items-center gap-1.5">
        <BackButton />
        <h1 className="truncate text-[16px] font-black text-[var(--text-primary)]">{profileUsername}</h1>
      </div>
    )
    if (pageConfig) return (
      <div className="flex min-w-0 items-center gap-2">
        {(isSubPage || pathname === '/settings/profile' || pathname === '/profile/setup') && <BackButton />}
        <PageTitle {...pageConfig} />
      </div>
    )
    return <BackButton />
  }

  const openNotif = () => { setUnread(false); setNotifOpen(true) }

  const renderRight = () => {
    if (isFeed) return (
      <button onClick={openNotif} className={`${iconCls} relative`} aria-label="Notifiche">
        <Bell size={22} strokeWidth={1.7} />
        {unread && <span className="notif-badge-pulse absolute right-2 top-2.5 h-2 w-2 rounded-full border-[1.5px] border-black bg-red-500" />}
      </button>
    )
    if (isOwnProfile) return (
      <>
        <Link href="/settings/profile" className={iconCls} aria-label="Modifica profilo">
          <Edit3 size={20} strokeWidth={1.75} />
        </Link>
        <Link href="/settings" className={iconCls} aria-label="Impostazioni">
          <Settings size={20} strokeWidth={1.75} />
        </Link>
      </>
    )
    if (pathname === '/notifications') return null
    return (
      <button onClick={openNotif} className={`${iconCls} relative`} aria-label="Notifiche">
        <Bell size={22} strokeWidth={1.7} />
        {unread && <span className="absolute right-2 top-2.5 h-2 w-2 rounded-full border-[1.5px] border-black bg-red-500" />}
      </button>
    )
  }

  const isSwipePage = pathname === '/swipe'

  return (
    <>
      <header
        className="swipe-header fixed left-0 right-0 top-0 z-[99] border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] backdrop-blur-2xl md:hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          visibility: isSwipePage ? 'hidden' : 'visible',
          pointerEvents: isSwipePage ? 'none' : 'auto',
        }}
        aria-hidden={isSwipePage}
      >
        <div className="flex h-[52px] items-center justify-between px-3">
          <div className="flex min-w-0 flex-1 items-center">
            {renderLeft()}
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {renderRight()}
          </div>
        </div>
      </header>

      <MobileNotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}