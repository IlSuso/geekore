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
    { href: '/home', label: t.nav.home, icon: Home },
    { href: '/for-you', label: t.nav.forYou, icon: Sparkles },
    { href: '/library', label: 'Library', icon: Library },
    { href: '/discover', label: t.nav.discover, icon: Search },
    { href: '/friends', label: 'Friends', icon: Users },
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
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
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-[100] h-12 border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] backdrop-blur-2xl">
        <div className="w-full flex items-center h-full">
          <div className="flex items-center gap-3 flex-1 min-w-0 px-4">
            <div className="flex-shrink-0 group flex items-center gap-2">
              <Link href="/home" className="inline-flex h-9 w-9 items-center justify-center" aria-label="Geekore home">
                <GeekoreMonogram className="h-9 w-9 text-[18px] rounded-xl" />
              </Link>
              <GeekoreWordmark href="/home" size="sm" className="hidden lg:inline-flex" />
            </div>

            <div ref={searchRef} className="relative w-full max-w-[260px]">
              <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${searchLoading ? 'animate-pulse' : 'text-zinc-500'}`} style={searchLoading ? { color: 'var(--accent)' } : {}} />
              <input
                ref={searchInputRef} value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca utenti..."
                className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-9 pr-8 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[rgba(230,255,61,0.45)]"
              />
              {searchQuery && (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" aria-label="Cancella ricerca">
                  <X size={13} />
                </button>
              )}

              {searchOpen && searchResults.length > 0 && (
                <div className="absolute top-full left-0 z-[110] mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/50">
                  {searchResults.map((res) => (
                    <Link key={res.username} href={`/profile/${res.username}`}
                      onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}
                      className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 transition-colors last:border-0 hover:bg-[var(--bg-card-hover)]">
                      <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0">
                        <Avatar src={res.avatar_url} username={res.username} displayName={res.display_name} size={32} />
                      </div>
                      <div>
                        <p className="gk-headline text-sm leading-tight">{res.display_name || res.username}</p>
                        <p className="gk-mono text-[10px] text-[var(--text-muted)]">@{res.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
                <div className="absolute top-full left-0 z-[110] mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-muted)] shadow-2xl">
                  Nessun utente trovato
                </div>
              )}
            </div>
          </div>

          <div className="flex items-end h-full flex-shrink-0">
            {NAV_ITEMS.map((item) => {
              const itemTab = pathnameToTab(item.href)
              const isActive = activeTab ? activeTab === itemTab : (item.href === '/home'
                ? pathname === '/home' || pathname === '/'
                : pathname === item.href)
              return (
                <button key={item.href}
                  title={item.label}
                  data-testid={`nav-${item.href.replace('/', '')}`}
                  onMouseEnter={item.href === '/for-you' && !isActive
                    ? () => fetch('/api/recommendations?type=all', { credentials: 'include' }).catch(() => {})
                    : undefined}
                  onClick={() => navigateToTab(item.href)}
                  className="group relative flex h-full w-16 flex-col items-center justify-center bg-transparent text-zinc-500 transition-colors hover:bg-[var(--bg-card-hover)] hover:text-zinc-200 lg:w-20"
                  style={{ color: isActive ? 'var(--accent)' : undefined }}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon size={21} strokeWidth={isActive ? 2.2 : 1.6} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 z-[130] -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full" style={{ background: 'var(--accent)' }} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-end flex-1 px-4">
            <Link href="/notifications" className="relative mr-3 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] transition-colors hover:bg-[var(--bg-card-hover)]" aria-label="Notifiche">
              <Bell size={17} className="text-zinc-400" />
            </Link>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 rounded-full transition-all ${menuOpen ? 'ring-2 ring-[rgba(230,255,61,0.35)]' : 'hover:opacity-90'}`}
                aria-label="Menu account"
              >
                <div className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[var(--border)] transition-all hover:ring-[rgba(230,255,61,0.45)]">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={`Avatar di ${currentDisplayName}`} width={36} height={36} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                      <User size={18} className="text-white" />
                    </div>
                  )}
                </div>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-[120] mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/70">
                  <Link href={`/profile/${currentUsername || 'me'}`} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-4 transition-colors hover:bg-[var(--bg-card-hover)]">
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-zinc-600/30 flex-shrink-0">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={`Avatar di ${currentDisplayName}`} width={48} height={48} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                          <User size={22} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="gk-headline truncate text-[var(--text-primary)]">{currentDisplayName || '…'}</p>
                      {currentUsername && <p className="gk-mono truncate text-[var(--text-muted)]">@{currentUsername}</p>}
                    </div>
                  </Link>

                  <div className="grid grid-cols-2 gap-1 p-2">
                    {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-card)] text-[var(--text-muted)]">
                          <Icon size={15} />
                        </div>
                        <span className="truncate">{label}</span>
                      </Link>
                    ))}
                  </div>

                  <div className="border-t border-[var(--border)] py-1">
                    <button onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-red-400 transition-colors hover:bg-[var(--bg-card-hover)] hover:text-red-300">
                      <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center">
                        <LogOut size={15} className="text-red-400" />
                      </div>
                      Esci da Geekore
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <nav className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-[100]" style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'rgba(11,11,15,0.97)' }}>
        <div className="flex h-[56px] items-stretch">
          {NAV_ITEMS.map((item) => {
            const itemTab = pathnameToTab(item.href)
            const isActive = activeTab
              ? activeTab === itemTab
              : (item.href === '/home'
                ? pathname === '/home' || pathname === '/'
                : pathname === item.href)

            return (
              <button key={item.href}
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
