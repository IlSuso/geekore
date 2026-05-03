'use client'
// MobileHeader — context-aware top bar per mobile.
// Feed: wordmark geekore + notifiche + avatar profilo
// Profilo proprio: username + edit + settings
// Profilo altrui: back + username
// Pagine miste: icona system neutra + titolo + notifiche + avatar

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
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'

const AUTH_PATHS = ['/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup']

function BackButton() {
  return (
    <button
      type="button"
      data-no-swipe="true"
      onClick={() => window.history.back()}
      className="-ml-2 flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
      aria-label="Torna indietro"
    >
      <ChevronLeft size={27} strokeWidth={1.75} />
    </button>
  )
}

interface PageTitleProps {
  title: string
  icon: ReactNode
}

function PageTitle({ title, icon }: PageTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex-shrink-0 text-[var(--text-muted)]">{icon}</span>
      <h1 className="gk-headline truncate text-[var(--text-primary)]">{title}</h1>
    </div>
  )
}

export function MobileHeader() {
  const pathname = usePathname()
  const { t } = useLocale()
  const [unread, setUnread] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
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

    supabase.from('profiles').select('username, display_name, avatar_url').eq('id', authUser.id).single()
      .then(({ data }) => {
        if (!data) return
        setUsername(data.username || null)
        setDisplayName(data.display_name || null)
        setAvatarUrl(data.avatar_url || null)
      })
  }, [authUser, pathname]) // eslint-disable-line

  if (pathname === '/' || AUTH_PATHS.some(p => pathname.startsWith(p))) return null

  const isFeed = pathname === '/home'
  const isOwnProfile = mounted && (pathname === '/profile/me' || (username && pathname === `/profile/${username}`))
  const PROFILE_RESERVED = new Set(['edit', 'setup', 'me', 'loading'])
  const profileParts = pathname.split('/')
  const profileUsername = isProfilePage ? profileParts[2] : null
  const isOtherProfile = isProfilePage && !isOwnProfile && profileParts.length === 3 && !PROFILE_RESERVED.has(profileUsername || '')
  const isSubPage = (profileParts.length > 3 && !isOtherProfile) || pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

  const iconCls = 'flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'

  const PAGE_CONFIG: Record<string, PageTitleProps> = {
    '/discover': { title: t.nav.discover, icon: <Search size={16} /> },
    '/for-you': { title: t.nav.forYou, icon: <Sparkles size={16} /> },
    '/trending': { title: 'Trending', icon: <TrendingUp size={16} /> },
    '/swipe': { title: 'Swipe', icon: <Shuffle size={16} /> },
    '/notifications': { title: 'Notifiche', icon: <Bell size={16} /> },
    '/settings/profile': { title: 'Modifica Profilo', icon: <Edit3 size={16} /> },
    '/settings': { title: t.nav.settings, icon: <Settings size={16} /> },
    '/profile/setup': { title: 'Crea Profilo', icon: <Edit3 size={16} /> },
    '/wishlist': { title: 'Wishlist', icon: <Bookmark size={16} /> },
    '/stats': { title: 'Statistiche', icon: <BarChart2 size={16} /> },
    '/leaderboard': { title: 'Classifica', icon: <Trophy size={16} /> },
    '/lists': { title: 'Liste', icon: <List size={16} /> },
    '/search': { title: 'Cerca', icon: <Search size={16} /> },
    '/explore': { title: 'Esplora', icon: <Search size={16} /> },
    '/friends': { title: 'Friends', icon: <Users size={16} /> },
    '/library': { title: 'Library', icon: <Library size={16} /> },
  }

  const pageConfig = Object.entries(PAGE_CONFIG)
    .sort(([a], [b]) => b.length - a.length)
    .find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1]

  const renderLeft = () => {
    if (isSubPage) return <BackButton />
    if (isFeed) return <GeekoreWordmark size="md" />
    if (isOwnProfile) return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="gk-headline truncate text-[var(--text-primary)]">
          {username || 'Profilo'}
        </span>
      </div>
    )
    if (isOtherProfile && profileUsername && profileUsername !== 'me') return (
      <div className="flex min-w-0 items-center gap-1.5">
        <BackButton />
        <h1 className="gk-headline truncate text-[var(--text-primary)]">{profileUsername}</h1>
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
  const currentUsername = username || 'me'
  const avatarSrc = avatarUrl || (username ? getLocalAvatarSvg(username, displayName) : undefined)

  const NotificationButton = () => (
    <button type="button" data-no-swipe="true" onClick={openNotif} className={`${iconCls} relative`} aria-label="Notifiche">
      <Bell size={21} strokeWidth={1.7} />
      {unread && <span className="notif-badge-pulse absolute right-2 top-2.5 h-2 w-2 rounded-full border-[1.5px] border-black bg-red-500" />}
    </button>
  )

  const ProfileAvatarLink = () => (
    <Link
      href={`/profile/${currentUsername}`}
      data-no-swipe="true"
      className="flex h-10 w-10 items-center justify-center rounded-2xl transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
      aria-label="Apri profilo"
    >
      <Avatar src={avatarSrc} username={currentUsername} displayName={displayName || username || 'Profilo'} size={30} />
    </Link>
  )

  const renderRight = () => {
    if (isOwnProfile) return (
      <>
        <Link href="/settings/profile" data-no-swipe="true" className={iconCls} aria-label="Modifica profilo">
          <Edit3 size={20} strokeWidth={1.75} />
        </Link>
        <Link href="/settings" data-no-swipe="true" className={iconCls} aria-label="Impostazioni">
          <Settings size={20} strokeWidth={1.75} />
        </Link>
      </>
    )
    if (pathname === '/notifications') return <ProfileAvatarLink />
    return (
      <>
        <NotificationButton />
        <ProfileAvatarLink />
      </>
    )
  }

  const isSwipePage = pathname === '/swipe'

  return (
    <>
      <header
        data-no-swipe="true"
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
