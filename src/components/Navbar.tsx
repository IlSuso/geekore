'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, Search, Sparkles, X, Bell, Users,
  Bookmark, BarChart3, List, Trophy, Compass, TrendingUp, Heart, Shuffle,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useActiveTab, pathnameToTab } from '@/context/ActiveTabContext'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'
import { GeekoreWordmark } from '@/components/ui/GeekoreWordmark'
import { appCopy } from '@/lib/i18n/appCopy'

const PUBLIC_NO_NAV_PATHS = ['/', '/login', '/register', '/auth/confirm', '/forgot-password', '/auth/reset-password', '/onboarding', '/privacy', '/terms', '/cookies']

type OwnProfileCache = {
  userId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  unread?: boolean
  ts: number
}

const PROFILE_CACHE_PREFIX = 'geekore:own-profile-header:'

function readOwnProfileCache(userId: string | null | undefined): OwnProfileCache | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${PROFILE_CACHE_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OwnProfileCache>
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

function writeOwnProfileCache(data: OwnProfileCache) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${PROFILE_CACHE_PREFIX}${data.userId}`, JSON.stringify(data))
    window.dispatchEvent(new CustomEvent('geekore:mobile-header-cache', { detail: data }))
  } catch {
    // localStorage non disponibile: ignora.
  }
}

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { setActiveTab } = useActiveTab()
  const supabase = createClient()
  const { t, locale } = useLocale()
  const copy = appCopy(locale)

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)


  const navigateToTab = useCallback((href: string) => {
    const tab = pathnameToTab(href)
    if (tab) setActiveTab(tab)
    router.push(href)
  }, [router, setActiveTab])

  const isPublicPageWithoutNav = PUBLIC_NO_NAV_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))
  const isAuthPage = isPublicPageWithoutNav
  const isPublicLanding = pathname === '/'

  const NAV_ITEMS = [
    { href: '/home', label: t.nav.home, icon: Home },
    { href: '/for-you', label: t.nav.forYou, icon: Sparkles },
    { href: '/swipe', label: copy.nav.swipe, icon: Shuffle },
    { href: '/discover', label: t.nav.discover, icon: Compass },
    { href: '/friends', label: copy.nav.friends, icon: Users },
  ]

  const SECONDARY_NAV = [
    { href: '/trending', label: copy.nav.trending, icon: TrendingUp },
    { href: '/wishlist', label: copy.nav.wishlist, icon: Heart },
    { href: '/leaderboard', label: copy.nav.leaderboard, icon: Trophy },
    { href: '/stats', label: copy.nav.stats, icon: BarChart3 },
    { href: '/lists', label: copy.nav.lists, icon: List },
  ]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setSearchQuery(''); setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])


  const authUser = useUser()
  useEffect(() => {
    if (isAuthPage || !authUser) {
      setIsLoggedIn(authUser !== null ? true : false)
      return
    }
    setIsLoggedIn(true)
    let cancelled = false

    const applyCache = (cache: OwnProfileCache | null) => {
      if (cancelled || !cache || cache.userId !== authUser.id) return
      setAvatarUrl(cache.avatarUrl || null)
      setDisplayName(cache.displayName || null)
      setUsername(cache.username || null)
    }

    applyCache(readOwnProfileCache(authUser.id))

    const onProfileCache = (event: Event) => applyCache((event as CustomEvent).detail as OwnProfileCache | null)
    window.addEventListener('geekore:mobile-header-cache', onProfileCache)

    supabase.from('profiles').select('avatar_url, display_name, username').eq('id', authUser.id).single()
      .then(({ data }) => {
        if (cancelled || !data) return
        const cache: OwnProfileCache = {
          userId: authUser.id,
          username: data.username || null,
          displayName: data.display_name || null,
          avatarUrl: data.avatar_url || null,
          ts: Date.now(),
        }
        setAvatarUrl(cache.avatarUrl)
        setDisplayName(cache.displayName)
        setUsername(cache.username)
        writeOwnProfileCache(cache)
      })
    return () => {
      cancelled = true
      window.removeEventListener('geekore:mobile-header-cache', onProfileCache)
    }
  }, [authUser, isAuthPage]) // eslint-disable-line

  const searchUsers = useCallback(async (val: string) => {
    if (val.length < 2) { setSearchResults([]); setSearchOpen(false); return }
    setSearchLoading(true)
    const { data } = await supabase.from('profiles')
      .select('username, display_name, avatar_url')
      .or(`username.ilike.%${val}%,display_name.ilike.%${val}%`)
      .limit(6)
    setSearchResults(data || [])
    setSearchOpen(true)
    setSearchLoading(false)
  }, [supabase])

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(searchQuery), 280)
    return () => clearTimeout(timer)
  }, [searchQuery, searchUsers])

  const clearSearch = () => {
    setSearchQuery(''); setSearchResults([]); setSearchOpen(false)
    searchInputRef.current?.focus()
  }

  const isRouteActive = useCallback((href: string) => {
    if (href === '/home') return pathname === '/home' || pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }, [pathname])

  const navbarVisible = !(
    isAuthPage ||
    (isPublicLanding && isLoggedIn === false) ||
    (isPublicLanding && isLoggedIn === null) ||
    isLoggedIn === null
  )
  useEffect(() => {
    if (navbarVisible) document.body.classList.remove('no-mobile-nav')
    else document.body.classList.add('no-mobile-nav')
    return () => { document.body.classList.remove('no-mobile-nav') }
  }, [navbarVisible])

  if (isAuthPage) return null
  if (isPublicLanding && isLoggedIn === false) return null
  if (isPublicLanding && isLoggedIn === null) return null
  if (isLoggedIn === null) return null

  const cachedProfile = authUser ? readOwnProfileCache(authUser.id) : null
  const currentUsername = username || cachedProfile?.username || ''
  const currentDisplayName = displayName || cachedProfile?.displayName || currentUsername || ''
  const currentAvatarUrl = avatarUrl || cachedProfile?.avatarUrl || null
  const localAvatarSrc = currentUsername ? getLocalAvatarSvg(currentUsername, currentDisplayName) : undefined
  const avatarSrc = currentAvatarUrl || localAvatarSrc

  return (
    <>
      <aside
        data-no-swipe="true"
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-[100] w-[240px] flex-col border-r border-[var(--border)] bg-[rgba(11,11,15,0.96)] px-4 py-5 backdrop-blur-2xl"
      >
        <div className="mb-5 flex items-center gap-2 px-1">
          <GeekoreWordmark size="md" />
        </div>

        <Link
          href={`/profile/${currentUsername || 'me'}`}
          data-no-swipe="true"
          className="mb-5 flex w-full items-center gap-3 rounded-3xl border border-[rgba(230,255,61,0.08)] bg-[rgba(255,255,255,0.025)] px-3 py-3 text-left transition-all hover:border-[rgba(230,255,61,0.18)] hover:bg-[rgba(230,255,61,0.055)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
          aria-label={copy.nav.yourProfile}
        >
          {avatarSrc ? (
            <Avatar src={avatarSrc} username={currentUsername || 'me'} displayName={currentDisplayName || 'Utente'} size={42} />
          ) : (
            <span className="h-[42px] w-[42px] flex-shrink-0 rounded-2xl bg-[var(--bg-card-hover)]" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-black leading-snug text-[var(--text-primary)]">{currentDisplayName || currentUsername || copy.nav.userFallback}</p>
            <p className="gk-mono truncate text-[11px] uppercase text-[var(--text-muted)]">{currentUsername || currentDisplayName || copy.nav.yourProfile}</p>
          </div>
        </Link>

        <nav className="space-y-1" aria-label={locale === 'it' ? 'Navigazione principale desktop' : 'Main desktop navigation'}>
          {NAV_ITEMS.map((item) => {
            const isActive = isRouteActive(item.href)
            return (
              <button
                key={item.href}
                type="button"
                data-no-swipe="true"
                data-testid={`nav-${item.href.replace('/', '')}`}
                onClick={() => navigateToTab(item.href)}
                className="relative flex h-10 w-full items-center gap-3 overflow-hidden rounded-2xl px-3 text-left text-[13px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                style={isActive
                  ? { background: 'rgba(230,255,61,0.085)', color: 'var(--accent)', border: '1px solid rgba(230,255,61,0.16)' }
                  : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--accent)]" />}
                <item.icon size={17} className="flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div ref={searchRef} className="relative mt-5">
          <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${searchLoading ? 'animate-pulse' : 'text-[var(--text-muted)]'}`} style={searchLoading ? { color: 'var(--accent)' } : {}} />
          <input
            ref={searchInputRef}
            data-no-swipe="true"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={copy.nav.searchUsers}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-8 pr-8 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[rgba(230,255,61,0.45)]"
          />
          {searchQuery && (
            <button type="button" data-no-swipe="true" onClick={clearSearch} className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label={copy.nav.clearSearch}>
              <X size={12} />
            </button>
          )}

          {searchOpen && (
            <div className="absolute left-0 top-full z-[120] mt-2 w-[260px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/70">
              {searchResults.length > 0 ? searchResults.map((res) => (
                <Link
                  key={res.username}
                  href={`/profile/${res.username}`}
                  data-no-swipe="true"
                  onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}
                  className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-3 transition-colors last:border-0 hover:bg-[var(--bg-card-hover)]"
                >
                  <Avatar src={res.avatar_url} username={res.username} displayName={res.display_name} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">{res.display_name || res.username}</p>
                    <p className="gk-mono truncate text-[var(--text-muted)]">{res.display_name ? res.display_name : res.username}</p>
                  </div>
                </Link>
              )) : searchQuery.length >= 2 && !searchLoading ? (
                <div className="px-4 py-3 text-sm text-[var(--text-muted)]">{copy.nav.noUsers}</div>
              ) : null}
            </div>
          )}
        </div>

        {(() => {
          const isNotificationsActive = isRouteActive('/notifications')
          return (
            <Link
              href="/notifications"
              data-no-swipe="true"
              aria-current={isNotificationsActive ? 'page' : undefined}
              className="mt-3 flex h-10 w-full items-center gap-3 rounded-2xl border px-3 text-[12px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
              style={isNotificationsActive
                ? { background: 'rgba(230,255,61,0.085)', color: 'var(--accent)', borderColor: 'rgba(230,255,61,0.16)' }
                : { background: 'rgba(255,255,255,0.018)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-xl transition-colors"
                style={{
                  background: isNotificationsActive ? 'rgba(230,255,61,0.14)' : 'rgba(230,255,61,0.07)',
                  color: 'var(--accent)',
                }}
              >
                <Bell size={15} />
              </span>
              <span>{copy.nav.notifications}</span>
            </Link>
          )
        })()}

        {/* Secondary nav — pagine raggiungibili */}
        <div className="mt-4">
          <div className="space-y-0.5">
            {SECONDARY_NAV.map(({ href, label, icon: Icon }) => {
              const isActive = isRouteActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  data-no-swipe="true"
                  className="flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', background: isActive ? 'rgba(230,255,61,0.07)' : 'transparent' }}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="mt-auto px-3 pb-2 pt-4">
          <p className="text-[11px] text-zinc-600">© 2025 Geekore</p>
        </div>
      </aside>

      <nav
        className="gk-bottom-nav-raised md:hidden"
        data-no-swipe="true"
        aria-label={locale === 'it' ? 'Navigazione mobile' : 'Mobile navigation'}
      >
        <div className="gk-bottom-nav-raised-inner">
          {NAV_ITEMS.map((item) => {
            const isActive = isRouteActive(item.href)

            return (
              <button
                key={item.href}
                type="button"
                data-no-swipe="true"
                data-testid={`nav-mobile-${item.href.replace('/', '')}`}
                className={`gk-bottom-nav-raised-item ${isActive ? 'is-active' : ''}`}
                onClick={() => navigateToTab(item.href)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="gk-bottom-nav-raised-pill" aria-hidden="true" />
                <item.icon
                  className="gk-bottom-nav-raised-icon"
                  size={19}
                  strokeWidth={isActive ? 2.4 : 1.75}
                  style={{ color: isActive ? 'var(--accent)' : undefined, fill: isActive ? 'var(--accent)' : 'none' }}
                />
                <span className="gk-bottom-nav-raised-label" style={{ color: isActive ? 'var(--accent)' : undefined }}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
