'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Bell, User, Zap, LogOut, Newspaper, Settings, Sparkles, ChevronDown, Edit3, Bookmark } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/locale'

const AUTH_PATHS = ['/login', '/register', '/auth/confirm']

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLocale()
  const [hasNewNotifications, setHasNewNotifications] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isProfileActive = pathname === '/profile/me' || pathname.startsWith('/profile/')
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p))

  const NAV_ITEMS = [
    { href: '/feed',          label: t.nav.home,          icon: Home     },
    { href: '/discover',      label: t.nav.discover,      icon: Search   },
    { href: '/for-you',       label: t.nav.forYou,        icon: Sparkles },
    { href: '/news',          label: t.nav.news,          icon: Newspaper },
    { href: '/notifications', label: t.nav.notifications, icon: Bell, hasDot: true },
  ]

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (pathname === '/notifications') setHasNewNotifications(false)
  }, [pathname])

  useEffect(() => {
    if (isAuthPage) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      // Fetch profile data
      supabase.from('profiles').select('avatar_url, display_name, username').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setAvatarUrl(data.avatar_url || null)
            setDisplayName(data.display_name || null)
            setUsername(data.username || null)
          }
        })

      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)
        .then(({ count }) => { if (count && count > 0) setHasNewNotifications(true) })

      channel = supabase
        .channel('navbar-notifications')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `receiver_id=eq.${user.id}`,
        }, () => setHasNewNotifications(true))
        .subscribe()
    })

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [isAuthPage])

  if (isAuthPage) return null

  const avatarInitial = (displayName?.[0] || username?.[0] || '?').toUpperCase()

  return (
    <>
      {/* Desktop navbar */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-zinc-800/60">
        <div className="max-w-6xl mx-auto w-full px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/30 group-hover:scale-105 transition-transform">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">geekore</span>
          </Link>

          {/* Nav items */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === '/feed'
                ? pathname === '/feed' || pathname === '/'
                : pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-violet-500/10 text-violet-400'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Avatar dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all ${
                dropdownOpen
                  ? 'bg-zinc-800 border-violet-500/50'
                  : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-violet-500/30 flex-shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xs">
                    {avatarInitial}
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-zinc-300 max-w-[100px] truncate hidden lg:block">
                {displayName || username || '…'}
              </span>
              <ChevronDown size={14} className={`text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-zinc-800">
                  <p className="text-sm font-semibold text-white truncate">{displayName || username}</p>
                  {username && <p className="text-xs text-zinc-500">@{username}</p>}
                </div>

                <div className="p-1.5 space-y-0.5">
                  <Link
                    href={`/profile/${username || 'me'}`}
                    onClick={() => setDropdownOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      isProfileActive ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <User size={16} />
                    {t.nav.profile}
                  </Link>
                  <Link
                    href="/profile/edit"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    <Edit3 size={16} />
                    Modifica profilo
                  </Link>
                  <Link
                    href="/wishlist"
                    onClick={() => setDropdownOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      pathname === '/wishlist' ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Bookmark size={16} />
                    Wishlist
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      pathname === '/settings' ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Settings size={16} />
                    {t.nav.settings}
                  </Link>
                </div>

                <div className="p-1.5 border-t border-zinc-800">
                  <button
                    onClick={() => { setDropdownOpen(false); handleLogout() }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <LogOut size={16} />
                    {t.nav.logout}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom navbar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-2xl border-t border-zinc-800/60">
        <div className="flex items-center justify-around py-2 px-2">
          {[...NAV_ITEMS, { href: '/profile/me', label: t.nav.profile, icon: User, hasDot: false }].map((item) => {
            const isActive = item.href === '/profile/me' ? isProfileActive : pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all ${
                  isActive ? 'text-violet-400' : 'text-zinc-500'
                }`}
              >
                <div className="relative">
                  {item.href === '/profile/me' && avatarUrl ? (
                    <div className={`w-6 h-6 rounded-full overflow-hidden ring-2 ${isActive ? 'ring-violet-400' : 'ring-zinc-700'}`}>
                      <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  )}
                  {'hasDot' in item && item.hasDot && hasNewNotifications && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black" />
                  )}
                </div>
                {isActive && (
                  <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
                )}
              </Link>
            )
          })}
          <Link
            href="/settings"
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all ${
              pathname === '/settings' ? 'text-violet-400' : 'text-zinc-500'
            }`}
          >
            <Settings size={22} strokeWidth={pathname === '/settings' ? 2.5 : 1.8} />
            {pathname === '/settings' && (
              <span className="text-[10px] font-semibold tracking-wide">{t.nav.settings}</span>
            )}
          </Link>
        </div>
      </nav>

      <div className="h-16" />
    </>
  )
}