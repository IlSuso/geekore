'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, Search, Sparkles, Library, User, X, Settings, LogOut, ChevronDown, Bell, Users,
  Bookmark, BarChart3, List, Trophy,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useActiveTab, pathnameToTab } from '@/context/ActiveTabContext'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'
import { GeekoreMonogram, GeekoreWordmark } from '@/components/ui/GeekoreWordmark'

const AUTH_PATHS = ['/login', '/register', '/auth/confirm', '/forgot-password', '/auth/reset-password', '/onboarding']

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { setActiveTab, activeTab } = useActiveTab()
  const supabase = createClient()
  const { t } = useLocale()

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

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const navigateToTab = useCallback((href: string) => {
    const tab = pathnameToTab(href)
    if (tab) setActiveTab(tab)
    router.push(href)
  }, [router, setActiveTab])

  const handleLogout = async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
    router.push('/login')
  }

  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p))
  const isPublicLanding = pathname === '/'

  const NAV_ITEMS = [
    { href: '/home', label: t.nav.home, icon: Home, glyph: '◉' },
    { href: '/for-you', label: t.nav.forYou, icon: Sparkles, glyph: '✦' },
    { href: '/library', label: 'Library', icon: Library, glyph: '▦' },
    { href: '/discover', label: t.nav.discover, icon: Search, glyph: '⌕' },
    { href: '/friends', label: 'Friends', icon: Users, glyph: '◐' },
  ]

  const ACCOUNT_LINKS = [
    { href: `/profile/${username || 'me'}`, label: 'Il tuo profilo', icon: User },
    { href: '/wishlist', label: 'Wishlist', icon: Bookmark },
    { href: '/stats', label: 'Stats', icon: BarChart3 },
    { href: '/lists', label: 'Liste', icon: List },
    { href: '/leaderboard', label: 'Classifica', icon: Trophy },
    { href: '/settings', label: 'Impostazioni', icon: Settings },
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
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
    supabase.from('profiles').select('avatar_url, display_name, username').eq('id', authUser.id).single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setAvatarUrl(data.avatar_url || null)
        setDisplayName(data.display_name || null)
        setUsername(data.username || null)
      })
    return () => { cancelled = true }
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

  const currentUsername = username || ''
  const currentDisplayName = displayName || username || ''
  const localAvatarSrc = currentUsername ? getLocalAvatarSvg(currentUsername, displayName) : undefined
  const avatarSrc = avatarUrl || localAvatarSrc

  return (
    <>
      <aside
        data-no-swipe="true"
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-[100] w-[200px] flex-col border-r border-[var(--border)] bg-[rgba(11,11,15,0.96)] px-3 py-5 backdrop-blur-2xl"
      >
        <div className="mb-7 flex items-center gap-2 px-1.5">
          <Link href="/home" data-no-swipe="true" className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 rounded-xl">
            <GeekoreWordmark size="md" />
          </Link>
        </div>

        <nav className="space-y-1" aria-label="Navigazione principale desktop">
          {NAV_ITEMS.map((item) => {
            const itemTab = pathnameToTab(item.href)
            const isActive = activeTab ? activeTab === itemTab : (item.href === '/home' ? pathname === '/home' || pathname === '/' : pathname === item.href)
            return (
              <button
                key={item.href}
                type="button"
                data-no-swipe="true"
                data-testid={`nav-${item.href.replace('/', '')}`}
                onMouseEnter={item.href === '/for-you' && !isActive ? () => fetch('/api/recommendations?type=all', { credentials: 'include' }).catch(() => {}) : undefined}
                onClick={() => navigateToTab(item.href)}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                style={isActive
                  ? { background: 'rgba(230,255,61,0.08)', color: 'var(--accent)' }
                  : { color: 'var(--text-secondary)' }}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="w-4 text-center text-[14px] leading-none">{item.glyph}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div ref={searchRef} className="relative mt-5">
          <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${searchLoading ? 'animate-pulse' : 'text-zinc-500'}`} style={searchLoading ? { color: 'var(--accent)' } : {}} />
          <input
            ref={searchInputRef}
            data-no-swipe="true"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca utenti..."
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-8 pr-8 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[rgba(230,255,61,0.45)]"
          />
          {searchQuery && (
            <button type="button" data-no-swipe="true" onClick={clearSearch} className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300" aria-label="Cancella ricerca">
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
                    <p className="gk-mono truncate text-[var(--text-muted)]">@{res.username}</p>
                  </div>
                </Link>
              )) : searchQuery.length >= 2 && !searchLoading ? (
                <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Nessun utente trovato</div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-auto border-t border-[var(--border-subtle)] pt-3">
          <Link href="/notifications" data-no-swipe="true" className="mb-2 flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">
            <Bell size={15} />
            Notifiche
          </Link>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setMenuOpen(o => !o)}
              className={`flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${menuOpen ? 'bg-[var(--bg-card-hover)]' : 'hover:bg-[var(--bg-card-hover)]'}`}
              aria-label="Menu account"
            >
              <Avatar src={avatarSrc} username={currentUsername || 'me'} displayName={currentDisplayName || 'Utente'} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-[var(--text-primary)]">{currentDisplayName || currentUsername || 'Utente'}</p>
                <p className="gk-mono truncate text-[var(--text-muted)]">{currentUsername ? `@${currentUsername}` : 'L42 · 247'}</p>
              </div>
              <ChevronDown size={13} className={`text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute bottom-full left-0 z-[130] mb-2 w-[260px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/70">
                <div className="grid grid-cols-2 gap-1 p-2">
                  {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href} data-no-swipe="true" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]">
                      <Icon size={15} />
                      <span className="truncate">{label}</span>
                    </Link>
                  ))}
                </div>
                <button type="button" data-no-swipe="true" onClick={handleLogout} className="flex w-full items-center gap-3 border-t border-[var(--border)] px-4 py-3 text-left text-sm font-bold text-red-400 transition-colors hover:bg-[var(--bg-card-hover)] hover:text-red-300">
                  <LogOut size={15} />
                  Esci da Geekore
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <nav className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-[100]" data-no-swipe="true" style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'rgba(11,11,15,0.97)' }}>
        <div className="flex h-[56px] items-stretch">
          {NAV_ITEMS.map((item) => {
            const itemTab = pathnameToTab(item.href)
            const isActive = activeTab
              ? activeTab === itemTab
              : (item.href === '/home' ? pathname === '/home' || pathname === '/' : pathname === item.href)

            return (
              <button key={item.href}
                type="button"
                data-no-swipe="true"
                data-testid={`nav-mobile-${item.href.replace('/', '')}`}
                className="relative flex flex-1 flex-col items-center justify-center gap-[3px] border-0 bg-transparent py-2"
                onClick={() => navigateToTab(item.href)}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && <span className="absolute top-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-[var(--accent)]" />}
                <item.icon
                  size={21}
                  strokeWidth={isActive ? 2.1 : 1.6}
                  style={{ color: isActive ? 'var(--accent)' : undefined }}
                  className={isActive ? '' : 'text-zinc-500'}
                  fill={isActive && item.href === '/home' ? 'var(--accent)' : 'none'}
                />
                <span className={`text-[11px] leading-none font-semibold ${isActive ? '' : 'text-zinc-500'}`} style={{ color: isActive ? 'var(--accent)' : undefined }}>
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
