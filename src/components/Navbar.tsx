'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Bell, Zap, Newspaper, Sparkles, ChevronDown, Edit3, Bookmark, User, Settings, LogOut, X, Sun, Moon } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/locale'
import { useTheme } from '@/lib/theme'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'

const AUTH_PATHS = ['/login', '/register', '/auth/confirm', '/forgot-password', '/auth/reset-password']
const PUBLIC_PATHS = ['/']

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLocale()
  const { theme, toggleTheme } = useTheme()

  const [hasNewNotifications, setHasNewNotifications] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isProfileActive = pathname === '/profile/me' || pathname.startsWith('/profile/')
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p))
  const isPublicLanding = pathname === '/'

  const NAV_ITEMS = [
    { href: '/feed',          label: t.nav.home,          icon: Home     },
    { href: '/discover',      label: t.nav.discover,      icon: Search   },
    { href: '/for-you',       label: t.nav.forYou,        icon: Sparkles },
    { href: '/news',          label: t.nav.news,          icon: Newspaper },
    { href: '/notifications', label: t.nav.notifications, icon: Bell, hasDot: true },
  ]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (pathname === '/notifications') { setHasNewNotifications(false); if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) (navigator as any).clearAppBadge().catch(() => {}); }
  }, [pathname])

  useEffect(() => {
    if (isAuthPage) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user)
      if (!user) return

      supabase.from('profiles').select('avatar_url, display_name, username').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setAvatarUrl(data.avatar_url || null)
            setDisplayName(data.display_name || null)
            setUsername(data.username || null)
          }
        })

      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false)
        .then(({ count }) => { if (count && count > 0) setHasNewNotifications(true) })

      channel = supabase.channel('navbar-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_id=eq.${user.id}` }, ({ new: newNotif }) => { setHasNewNotifications(true); if ('setAppBadge' in navigator) (navigator as any).setAppBadge(1).catch(() => {}); })
        .subscribe()
    })

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [isAuthPage])

  const searchUsers = useCallback(async (val: string) => {
    if (val.length < 2) { setSearchResults([]); setSearchOpen(false); return }
    setSearchLoading(true)
    const { data } = await supabase.from('profiles').select('username, display_name, avatar_url').or(`username.ilike.%${val}%,display_name.ilike.%${val}%`).limit(6)
    setSearchResults(data || [])
    setSearchOpen(true)
    setSearchLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(searchQuery), 280)
    return () => clearTimeout(timer)
  }, [searchQuery, searchUsers])

  const clearSearch = () => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); searchInputRef.current?.focus() }

  if (isAuthPage) return null
  if (isPublicLanding && isLoggedIn === false) return null
  if (isPublicLanding && isLoggedIn === null) return null

  const isDark = theme === 'dark'
  const currentUsername = username || ''
  const currentDisplayName = displayName || username || ''

  // Generate local avatar src (no dicebear)
  const localAvatarSrc = currentUsername ? getLocalAvatarSvg(currentUsername, displayName) : undefined

  return (
    <>
      {/* Desktop navbar */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-zinc-800/60">
        <div className="max-w-6xl mx-auto w-full px-6 py-4 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/30 group-hover:scale-105 transition-transform">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">geekore</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === '/feed' ? pathname === '/feed' || pathname === '/' : pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isActive ? 'bg-violet-500/10 text-violet-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}>
                  <item.icon size={18} />
                  {item.label}
                  {item.hasDot && hasNewNotifications && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}
                </Link>
              )
            })}
          </div>

          {/* Search bar */}
          <div ref={searchRef} className="flex-1 max-w-xs relative mx-2">
            <div className={`flex items-center gap-2 bg-zinc-900 border rounded-2xl px-4 py-2 transition-all ${searchOpen && searchResults.length > 0 ? 'border-violet-500/50' : 'border-zinc-800 focus-within:border-violet-500/30'}`}>
              <Search size={14} className={searchLoading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'} />
              <input ref={searchInputRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cerca utenti..."
                className="bg-transparent outline-none text-sm w-full placeholder-zinc-600 text-white" />
              {searchQuery && <button onClick={clearSearch} className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"><X size={13} /></button>}
            </div>

            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 z-50">
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
              <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-500 shadow-2xl z-50">
                Nessun utente trovato
              </div>
            )}
          </div>

          {/* Theme toggle + Avatar dropdown */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <button onClick={toggleTheme} title={isDark ? 'Tema chiaro' : 'Tema scuro'}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-yellow-400 hover:bg-zinc-900 transition-all">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setDropdownOpen(v => !v)}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all ${dropdownOpen ? 'bg-zinc-800 border-violet-500/50' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'}`}>
                <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-violet-500/30 flex-shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : currentUsername ? (
                    <img src={localAvatarSrc} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xs">?</div>
                  )}
                </div>
                <span className="text-sm font-medium text-zinc-300 max-w-[100px] truncate hidden lg:block">
                  {currentDisplayName || '…'}
                </span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-sm font-semibold text-white truncate">{currentDisplayName}</p>
                    {currentUsername && <p className="text-xs text-zinc-500">@{currentUsername}</p>}
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <Link href={`/profile/${currentUsername || 'me'}`} onClick={() => setDropdownOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${isProfileActive ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}>
                      <User size={16} /> {t.nav.profile}
                    </Link>
                    <Link href="/profile/edit" onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all">
                      <Edit3 size={16} /> Modifica profilo
                    </Link>
                    <Link href="/wishlist" onClick={() => setDropdownOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${pathname === '/wishlist' ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}>
                      <Bookmark size={16} /> Wishlist
                    </Link>
                    <Link href="/settings" onClick={() => setDropdownOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${pathname === '/settings' ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}>
                      <Settings size={16} /> {t.nav.settings}
                    </Link>
                    <button onClick={() => { toggleTheme(); setDropdownOpen(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all">
                      {isDark ? <Sun size={16} /> : <Moon size={16} />}
                      {isDark ? 'Tema chiaro' : 'Tema scuro'}
                    </button>
                  </div>
                  <div className="p-1.5 border-t border-zinc-800">
                    <button onClick={() => { setDropdownOpen(false); handleLogout() }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <LogOut size={16} /> {t.nav.logout}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom navbar */}
      <nav className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-2xl border-t border-zinc-800/60">
        <div className="flex items-center justify-around py-2 px-1">
          {[...NAV_ITEMS, { href: '/profile/me', label: t.nav.profile, icon: User, hasDot: false }].map((item) => {
            const isActive = item.href === '/profile/me' ? isProfileActive : pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-2xl transition-all min-w-[44px] ${isActive ? 'text-violet-400' : 'text-zinc-500'}`}>
                <div className="relative">
                  {item.href === '/profile/me' && (avatarUrl || currentUsername) ? (
                    <div className={`w-6 h-6 rounded-full overflow-hidden ring-2 ${isActive ? 'ring-violet-400' : 'ring-zinc-700'}`}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <img src={localAvatarSrc} alt="avatar" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ) : (
                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  )}
                  {'hasDot' in item && item.hasDot && hasNewNotifications && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-black" />
                  )}
                </div>
                <span className={`text-[9px] font-medium tracking-wide transition-all ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
          <button onClick={toggleTheme} className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-2xl transition-all min-w-[44px] text-zinc-500 hover:text-yellow-400">
            {isDark ? <Sun size={22} strokeWidth={1.8} /> : <Moon size={22} strokeWidth={1.8} />}
          </button>
        </div>
      </nav>

      <div className="h-16" />
    </>
  )
}