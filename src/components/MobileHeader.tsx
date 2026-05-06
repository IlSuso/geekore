'use client'
// MobileHeader — context-aware top bar per mobile.
// Feed: wordmark geekore + notifiche + avatar profilo
// Profilo proprio: username + edit + settings
// Profilo altrui: back + username
// Pagine miste: icona system neutra + titolo + notifiche + avatar

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Bell, Settings, Edit3, ChevronLeft,
  Search, Sparkles, TrendingUp, Users, Shuffle,
  Bookmark, BarChart2, Trophy, List, Library,
} from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { appCopy } from '@/lib/i18n/appCopy'
import { useState, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { GeekoreWordmark } from '@/components/ui/GeekoreWordmark'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'

// PERF: il drawer notifiche non deve stare nel bundle dell'header iniziale.
const MobileNotificationsDrawer = dynamic(() => import('@/components/feed/MobileNotificationsDrawer').then(m => m.MobileNotificationsDrawer), { ssr: false })

const PUBLIC_NO_HEADER_PATHS = ['/', '/login', '/register', '/auth/', '/forgot-password', '/onboarding', '/profile/setup', '/privacy', '/terms', '/cookies']

function BackButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      data-no-swipe="true"
      onClick={() => window.history.back()}
      className="-ml-2 flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
      aria-label={label}
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

interface MobileHeaderProps {
  pathnameOverride?: string
  embeddedInTabPanel?: boolean
}

const KEEP_ALIVE_MOBILE_HEADER_ROUTES = new Set(['/home', '/for-you', '/swipe', '/discover', '/friends'])


type HeaderProfileCache = {
  userId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  unread: boolean
  ts: number
}

let mobileHeaderProfileCache: HeaderProfileCache | null = null
let mobileHeaderProfilePromise: Promise<HeaderProfileCache | null> | null = null

const PROFILE_CACHE_PREFIX = 'geekore:own-profile-header:'

function readHeaderProfileCache(userId: string | null | undefined): HeaderProfileCache | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${PROFILE_CACHE_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HeaderProfileCache>
    if (parsed.userId !== userId) return null
    return {
      userId,
      username: parsed.username || null,
      displayName: parsed.displayName || null,
      avatarUrl: parsed.avatarUrl || null,
      unread: !!parsed.unread,
      ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
    }
  } catch {
    return null
  }
}

function writeHeaderProfileCache(data: HeaderProfileCache) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${PROFILE_CACHE_PREFIX}${data.userId}`, JSON.stringify(data))
  } catch {
    // localStorage può essere non disponibile in privacy mode: ignora.
  }
}

function emitHeaderProfileCache(data: HeaderProfileCache) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('geekore:mobile-header-cache', { detail: data }))
}

async function loadMobileHeaderData(userId: string): Promise<HeaderProfileCache | null> {
  if (mobileHeaderProfileCache?.userId === userId) return mobileHeaderProfileCache

  const stored = readHeaderProfileCache(userId)
  if (stored) {
    mobileHeaderProfileCache = stored
    emitHeaderProfileCache(stored)
  }

  if (mobileHeaderProfilePromise) return mobileHeaderProfilePromise

  mobileHeaderProfilePromise = (async () => {
    const supabase = createClient()
    // Profilo subito; notifiche leggermente dopo. Così avatar/header non aspettano il count.
    let profile: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null = null
    try {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', userId)
        .single()
      profile = data
    } catch {
      profile = null
    }

    const base: HeaderProfileCache = {
      userId,
      username: profile?.username || null,
      displayName: profile?.display_name || null,
      avatarUrl: profile?.avatar_url || null,
      unread: false,
      ts: Date.now(),
    }
    mobileHeaderProfileCache = base
    writeHeaderProfileCache(base)
    emitHeaderProfileCache(base)

    window.setTimeout(() => {
      void (async () => {
        try {
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', userId)
            .eq('is_read', false)

          if (mobileHeaderProfileCache?.userId === userId) {
            mobileHeaderProfileCache = { ...mobileHeaderProfileCache, unread: !!count && count > 0, ts: Date.now() }
            writeHeaderProfileCache(mobileHeaderProfileCache)
            emitHeaderProfileCache(mobileHeaderProfileCache)
          }
        } catch {
          // Ignore notification-count failures: the header should still render immediately.
        }
      })()
    }, 900)

    return base
  })().finally(() => { mobileHeaderProfilePromise = null })

  return mobileHeaderProfilePromise
}

export function MobileHeader({ pathnameOverride, embeddedInTabPanel = false }: MobileHeaderProps = {}) {
  const realPathname = usePathname()
  const pathname = pathnameOverride ?? realPathname
  const { t, locale } = useLocale()
  const copy = appCopy(locale)
  const [unread, setUnread] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const isProfilePage = pathname.startsWith('/profile/')

  const authUser = useUser()
  const cachedProfile = authUser ? readHeaderProfileCache(authUser.id) : null
  const effectiveUsername = username || cachedProfile?.username || null
  const effectiveDisplayName = displayName || cachedProfile?.displayName || null
  const effectiveAvatarUrl = avatarUrl || cachedProfile?.avatarUrl || null
  useEffect(() => {
    setMounted(true)
    if (!authUser) return

    let cancelled = false
    const apply = (data: HeaderProfileCache | null) => {
      if (cancelled || !data || data.userId !== authUser.id) return
      setUsername(data.username)
      setDisplayName(data.displayName)
      setAvatarUrl(data.avatarUrl)
      setUnread(data.unread)
    }

    const cached = mobileHeaderProfileCache?.userId === authUser.id ? mobileHeaderProfileCache : readHeaderProfileCache(authUser.id)
    if (cached) {
      mobileHeaderProfileCache = cached
      apply(cached)
    }
    loadMobileHeaderData(authUser.id).then(apply).catch(() => null)

    const onCache = (event: Event) => apply((event as CustomEvent).detail as HeaderProfileCache | null)
    window.addEventListener('geekore:mobile-header-cache', onCache)
    return () => {
      cancelled = true
      window.removeEventListener('geekore:mobile-header-cache', onCache)
    }
  }, [authUser?.id]) // eslint-disable-line

  if (PUBLIC_NO_HEADER_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))) return null

  // Sulle tab keep-alive l'header mobile viene renderizzato dentro ogni panel.
  // Così durante lo swipe orizzontale header e pagina scorrono insieme, senza
  // dover fare spazio a un header globale fisso.
  if (!embeddedInTabPanel && KEEP_ALIVE_MOBILE_HEADER_ROUTES.has(pathname)) return null

  const isFeed = pathname === '/home'
  const isOwnProfile = mounted && (pathname === '/profile/me' || (effectiveUsername && pathname === `/profile/${effectiveUsername}`))
  const PROFILE_RESERVED = new Set(['edit', 'setup', 'me', 'loading'])
  const profileParts = pathname.split('/')
  const profileUsername = isProfilePage ? profileParts[2] : null
  const isOtherProfile = isProfilePage && !isOwnProfile && profileParts.length === 3 && !PROFILE_RESERVED.has(profileUsername || '')
  const isSubPage = (profileParts.length > 3 && !isOtherProfile) || pathname.startsWith('/stats/') || pathname.startsWith('/lists/')

  const iconCls = 'flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'

  const PAGE_CONFIG: Record<string, PageTitleProps> = {
    '/discover': { title: t.nav.discover, icon: <Search size={16} /> },
    '/for-you': { title: t.nav.forYou, icon: <Sparkles size={16} /> },
    '/trending': { title: copy.nav.trending, icon: <TrendingUp size={16} /> },
    '/swipe': { title: copy.nav.swipe, icon: <Shuffle size={16} /> },
    '/notifications': { title: copy.nav.notifications, icon: <Bell size={16} /> },
    '/settings/profile': { title: copy.nav.editProfile, icon: <Edit3 size={16} /> },
    '/settings': { title: t.nav.settings, icon: <Settings size={16} /> },
    '/profile/setup': { title: copy.nav.createProfile, icon: <Edit3 size={16} /> },
    '/wishlist': { title: copy.nav.wishlist, icon: <Bookmark size={16} /> },
    '/stats': { title: copy.nav.stats, icon: <BarChart2 size={16} /> },
    '/leaderboard': { title: copy.nav.leaderboard, icon: <Trophy size={16} /> },
    '/lists': { title: copy.nav.lists, icon: <List size={16} /> },
    '/explore': { title: copy.nav.explore, icon: <Search size={16} /> },
    '/friends': { title: copy.nav.friends, icon: <Users size={16} /> },
    '/community': { title: copy.nav.friends, icon: <Users size={16} /> },
    '/library': { title: t.nav.library, icon: <Library size={16} /> },
  }

  const pageConfig = Object.entries(PAGE_CONFIG)
    .sort(([a], [b]) => b.length - a.length)
    .find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1]

  const renderLeft = () => {
    if (isSubPage) return <BackButton label={copy.nav.back} />
    if (isFeed) return <GeekoreWordmark size="md" />
    if (isOwnProfile) return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="gk-headline truncate text-[var(--text-primary)]">
          {effectiveUsername || copy.nav.profileFallback}
        </span>
      </div>
    )
    if (isOtherProfile && profileUsername && profileUsername !== 'me') return (
      <div className="flex min-w-0 items-center gap-1.5">
        <BackButton label={copy.nav.back} />
        <h1 className="gk-headline truncate text-[var(--text-primary)]">{profileUsername}</h1>
      </div>
    )
    if (pageConfig) return (
      <div className="flex min-w-0 items-center gap-2">
        {(isSubPage || pathname === '/settings/profile' || pathname === '/profile/setup') && <BackButton label={copy.nav.back} />}
        <PageTitle {...pageConfig} />
      </div>
    )
    return <BackButton label={copy.nav.back} />
  }

  const openNotif = () => { setUnread(false); setNotifOpen(true) }
  const currentUsername = effectiveUsername || 'me'
  const avatarSrc = effectiveAvatarUrl || (effectiveUsername ? getLocalAvatarSvg(effectiveUsername, effectiveDisplayName) : undefined)

  const NotificationButton = () => (
    <button type="button" data-no-swipe="true" onClick={openNotif} className={`${iconCls} relative`} aria-label={copy.nav.notifications}>
      <Bell size={21} strokeWidth={1.7} />
      {unread && <span className="notif-badge-pulse absolute right-2 top-2.5 h-2 w-2 rounded-full border-[1.5px] border-black bg-red-500" />}
    </button>
  )

  const ProfileAvatarLink = () => (
    <Link
      href={`/profile/${currentUsername}`}
      data-no-swipe="true"
      className="flex h-10 w-10 items-center justify-center rounded-2xl transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
      aria-label={copy.nav.openProfile}
    >
      {avatarSrc ? (
        <Avatar src={avatarSrc} username={currentUsername} displayName={effectiveDisplayName || effectiveUsername || copy.nav.profileFallback} size={30} />
      ) : (
        <span className="h-[30px] w-[30px] rounded-xl bg-[var(--bg-card-hover)]" aria-hidden="true" />
      )}
    </Link>
  )

  const renderRight = () => {
    if (isOwnProfile) return (
      <>
        <Link href="/settings/profile" data-no-swipe="true" className={iconCls} aria-label={copy.nav.editProfile}>
          <Edit3 size={20} strokeWidth={1.75} />
        </Link>
        <Link href="/settings" data-no-swipe="true" className={iconCls} aria-label={t.nav.settings}>
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
        className={`${embeddedInTabPanel ? 'gk-panel-mobile-header' : 'gk-mobile-header swipe-header'} fixed left-0 right-0 top-0 z-[99] border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] backdrop-blur-2xl md:hidden`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          visibility: isSwipePage ? 'hidden' : 'visible',
          pointerEvents: isSwipePage ? 'none' : 'auto',
        }}
        aria-hidden={isSwipePage}
      >
        <div className="flex h-[52px] w-full items-center gap-2 px-3">
          <div className="flex min-w-0 flex-1 items-center justify-start">
            {renderLeft()}
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center justify-end gap-0.5">
            {renderRight()}
          </div>
        </div>
      </header>

      <MobileNotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
