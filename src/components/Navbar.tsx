'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, Search, Zap, Sparkles, Shuffle, User, X, Settings, LogOut, ChevronDown,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'

const AUTH_PATHS = ['/login', '/register', '/auth/confirm', '/forgot-password', '/auth/reset-password', '/onboarding']

export default function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const { t }    = useLocale()

  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(null)
  const [displayName,  setDisplayName]  = useState<string | null>(null)
  const [username,     setUsername]     = useState<string | null>(null)
  const [isLoggedIn,   setIsLoggedIn]   = useState<boolean | null>(null)

  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const searchRef    = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
    router.push('/login')
  }

  const isProfileActive = pathname === '/profile/me' || pathname.startsWith('/profile/')
  const isAuthPage      = AUTH_PATHS.some(p => pathname.startsWith(p))
  const isPublicLanding = pathname === '/'

  const NAV_ITEMS = [
    { href: '/home',     label: t.nav.home,    icon: Home     },
    { href: '/discover', label: t.nav.discover, icon: Search  },
    { href: '/for-you',  label: t.nav.forYou,  icon: Sparkles },
    { href: '/swipe',    label: 'Swipe',        icon: Shuffle  },
  ]

  const MOBILE_NAV_ITEMS = [
    { href: '/home',     label: t.nav.home,    icon: Home,     hasDot: false },
    { href: '/discover', label: t.nav.discover, icon: Search,  hasDot: false },
    { href: '/for-you',  label: t.nav.forYou,  icon: Sparkles, hasDot: false },
    { href: '/swipe',    label: 'Swipe',        icon: Shuffle,  hasDot: false },
    { href: username ? `/profile/${username}` : '/profile/me', label: t.nav.profile, icon: User, hasDot: false },
  ]

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setSearchQuery(''); setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (isAuthPage) return
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      setIsLoggedIn(!!user)
      if (!user) return
      supabase.from('profiles').select('avatar_url, display_name, username').eq('id', user.id).single()
        .then(({ data }) => {
          if (cancelled || !data) return
          setAvatarUrl(data.avatar_url || null)
          setDisplayName(data.display_name || null)
          setUsername(data.username || null)
        })
    })
    return () => { cancelled = true }
  }, [isAuthPage])

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
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(searchQuery), 280)
    return () => clearTimeout(timer)
  }, [searchQuery, searchUsers])

  const clearSearch = () => {
    setSearchQuery(''); setSearchResults([]); setSearchOpen(false)
    searchInputRef.current?.focus()
  }

  if (isAuthPage) return null
  if (isPublicLanding && isLoggedIn === false) return null
  if (isPublicLanding && isLoggedIn === null)  return null
  if (isLoggedIn === null) return null

  const currentUsername    = username || ''
  const currentDisplayName = displayName || username || ''
  const localAvatarSrc     = currentUsername ? getLocalAvatarSvg(currentUsername, displayName) : undefined
  const avatarSrc          = avatarUrl || localAvatarSrc

  return (
    <>
      {/* ── Desktop navbar — Facebook layout ─────────────────────────────── */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-[100] bg-black/90 backdrop-blur-2xl border-b border-zinc-800/60 h-14">
        <div className="w-full flex items-center h-full">

          {/* LEFT: Logo + Search ─────────────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-1 min-w-0 px-4">
            <Link href="/" className="flex-shrink-0 group">
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/25 group-hover:scale-105 transition-transform">
                <Zap size={17} className="text-white" />
              </div>
            </Link>

            <div ref={searchRef} className="relative w-full max-w-[260px]">
              <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${searchLoading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'}`} />
              <input
                ref={searchInputRef} value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca utenti..."
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500/60 rounded-full pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  <X size={13} />
                </button>
              )}

              {searchOpen && searchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 z-[110]">
                  {searchResults.map((res) => (
                    <Link key={res.username} href={`/profile/${res.username}`}
                      onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0">
                      <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0">
                        <Avatar src={res.avatar_url} username={res.username} displayName={res.display_name} size={32} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white leading-tight">{res.display_name || res.username}</p>
                        <p className="text-xs text-violet-400">@{res.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
                <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-500 shadow-2xl z-[110]">
                  Nessun utente trovato
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Nav icon tabs ───────────────────────────────────────── */}
          <div className="flex items-end h-full flex-shrink-0">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === '/home'
                ? pathname === '/home' || pathname === '/'
                : pathname === item.href
              return (
                <Link key={item.href} href={item.href} prefetch={true}
                  title={item.label}
                  data-testid={`nav-${item.href.replace('/', '')}`}
                  onMouseEnter={item.href === '/for-you' && !isActive
                    ? () => fetch('/api/recommendations?type=all', { credentials: 'include' }).catch(() => {})
                    : undefined}
                  className={`relative flex flex-col items-center justify-center w-16 lg:w-20 h-full transition-colors group ${
                    isActive ? 'text-violet-400' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60'
                  }`}
                >
                  <item.icon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
                  {/* Active bottom indicator — stile Facebook */}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full bg-violet-500" />
                  )}
                </Link>
              )
            })}
          </div>

          {/* RIGHT: Avatar + dropdown menu ───────────────────────────────── */}
          <div className="flex items-center justify-end flex-1 px-4">
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 rounded-full transition-all ${menuOpen ? 'ring-2 ring-violet-500/60' : 'hover:opacity-90'}`}
                aria-label="Menu account"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-zinc-700 hover:ring-violet-500/50 transition-all">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="avatar" width={36} height={36} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                      <User size={18} className="text-white" />
                    </div>
                  )}
                </div>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden z-[120]">
                  {/* User info header */}
                  <Link
                    href={`/profile/${currentUsername || 'me'}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-4 hover:bg-zinc-900 transition-colors border-b border-zinc-800"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-violet-500/30 flex-shrink-0">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="avatar" width={48} height={48} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                          <User size={22} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{currentDisplayName || '…'}</p>
                      {currentUsername && <p className="text-xs text-zinc-500 truncate">@{currentUsername}</p>}
                    </div>
                  </Link>

                  {/* Menu items */}
                  <div className="py-1">
                    <Link href={`/profile/${currentUsername || 'me'}`} onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900 transition-colors text-sm text-zinc-300 hover:text-white">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
                        <User size={15} />
                      </div>
                      Il tuo profilo
                    </Link>
                    <Link href="/settings" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900 transition-colors text-sm text-zinc-300 hover:text-white">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
                        <Settings size={15} />
                      </div>
                      Impostazioni
                    </Link>
                  </div>

                  <div className="border-t border-zinc-800 py-1">
                    <button onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900 transition-colors text-sm text-red-400 hover:text-red-300 w-full text-left">
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

      {/* ── Mobile bottom navbar ─────────────────────────────────────────── */}
      <nav
        className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-[100]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'rgba(0,0,0,0.97)' }}
      >
        <div className="flex items-stretch h-[56px]">
          {MOBILE_NAV_ITEMS.map((item) => {
            const isActive = item.href.startsWith('/profile/')
              ? isProfileActive
              : item.href === '/home'
              ? pathname === '/home' || pathname === '/'
              : pathname === item.href

            return (
              <Link key={item.href} href={item.href} prefetch={true}
                data-testid={`nav-mobile-${item.href.replace('/', '')}`}
                className="flex flex-col items-center justify-center flex-1 relative gap-[3px] py-2"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
                }}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-violet-500" style={{ width: 28, height: 2 }} />
                )}
                {item.href.startsWith('/profile/') && (avatarUrl || currentUsername) ? (
                  <div className="rounded-full p-[2px]" style={{
                    background: isActive ? 'linear-gradient(45deg, #7c3aed 0%, #a855f7 50%, #db2777 100%)' : 'transparent',
                    border: isActive ? 'none' : '1.5px solid #3f3f3f',
                  }}>
                    <div className="rounded-full overflow-hidden bg-black p-[1.5px]">
                      <div className="w-[22px] h-[22px] rounded-full overflow-hidden">
                        <img src={avatarUrl || localAvatarSrc} alt="avatar" width={22} height={22} className="w-full h-full object-cover" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <item.icon size={22} strokeWidth={isActive ? 2.1 : 1.6}
                    className={isActive ? 'text-white' : 'text-zinc-500'}
                    fill={isActive && item.href === '/home' ? 'white' : 'none'}
                  />
                )}
                <span className={`text-[10px] leading-none font-medium tracking-tight ${isActive ? 'text-white' : 'text-zinc-600'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}