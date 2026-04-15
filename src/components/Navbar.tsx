'use client'
// DESTINAZIONE: src/components/Navbar.tsx

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, Search, Bell, Zap, Newspaper, Sparkles, TrendingUp,
  ChevronDown, Edit3, Bookmark, User, Settings, LogOut,
  X, Sun, Moon, Users, Heart, UserPlus, MessageSquare, Star,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/lib/theme'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'

const AUTH_PATHS = ['/login', '/register', '/auth/confirm', '/forgot-password', '/auth/reset-password']

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  is_read: boolean
  created_at: string
  sender_id?: string
  post_id?: string
  sender?: { username: string; display_name: string; avatar_url: string | null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Adesso'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}g`
  return `${Math.floor(d / 7)}sett`
}

function notifAction(type: string): string {
  switch (type) {
    case 'like':    return 'ha messo like al tuo post'
    case 'follow':  return 'ha iniziato a seguirti'
    case 'comment': return 'ha commentato il tuo post'
    case 'rating':  return 'ha votato un media'
    default:        return 'ha interagito con te'
  }
}

function NotifText({ n, onClose }: { n: Notification; onClose: () => void }) {
  const username = n.sender?.username
  const name = n.sender?.display_name || username || 'Qualcuno'
  const action = notifAction(n.type)
  return (
    <p className="text-xs text-zinc-300 leading-snug">
      {username ? (
        <Link
          href={`/profile/${username}`}
          onClick={onClose}
          className="font-semibold text-white hover:text-violet-400 transition-colors"
        >
          {name}
        </Link>
      ) : (
        <span className="font-semibold text-white">{name}</span>
      )}{' '}
      {action}
    </p>
  )
}

function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case 'like':    return <Heart size={11} className="text-red-400 fill-red-400" />
    case 'follow':  return <UserPlus size={11} className="text-violet-400" />
    case 'comment': return <MessageSquare size={11} className="text-sky-400" />
    case 'rating':  return <Star size={11} className="text-yellow-400 fill-yellow-400" />
    default:        return <Bell size={11} className="text-zinc-400" />
  }
}

// ─── Notification Popover ─────────────────────────────────────────────────────

const PREVIEW_LIMIT = 5

function NotificationPopover({
  open, onClose, userId, onRead, mobile = false,
}: {
  open: boolean
  onClose: () => void
  userId: string
  onRead: () => void
  mobile?: boolean
}) {
  const { t } = useLocale()                     // ← spostato in alto, prima di qualsiasi altro hook
  const supabase = createClient()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    if (open) {
      // Delay to avoid the same click that opened the popover closing it immediately
      const timer = setTimeout(() => document.addEventListener('mousedown', handler), 10)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('mousedown', handler)
      }
    }
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !userId) return
    setLoading(true)

    supabase
      .from('notifications')
      .select('id, type, is_read, created_at, sender_id, post_id, sender:sender_id(username, display_name, avatar_url)')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_LIMIT + 1)
      .then(({ data }) => {
        setNotifications((data as any) || [])
        setLoading(false)
      })

    // Segna come lette
    supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', userId)
      .eq('is_read', false)
      .then(() => onRead())
  }, [open, userId, onRead])

  if (!open) return null

  const preview = notifications.slice(0, PREVIEW_LIMIT)
  const hasMore = notifications.length > PREVIEW_LIMIT

  return (
    <div
      ref={ref}
      className={`absolute z-[110] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden ${
        mobile
          ? 'bottom-full right-1/2 translate-x-1/2 mb-3 w-[calc(100vw-2rem)] max-w-sm'
          : 'right-0 top-full mt-2 w-80'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-white">{t.nav.notifications}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Lista */}
      <div>
        {loading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-zinc-800 rounded-full w-3/4" />
                  <div className="h-2 bg-zinc-800 rounded-full w-1/3" />
                </div>
              </div>
            ))}
          </>
        ) : preview.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell size={26} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">Nessuna notifica</p>
          </div>
        ) : (
          preview.map(n => (
            <div
              key={n.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/40 transition-colors ${!n.is_read ? 'bg-violet-500/5' : ''}`}
            >
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800">
                  {n.sender && (
                    <Avatar
                      src={n.sender.avatar_url}
                      username={n.sender.username}
                      displayName={n.sender.display_name}
                      size={36}
                    />
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center">
                  <NotifIcon type={n.type} />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <NotifText n={n} onClose={onClose} />
                <p className="text-[10px] text-zinc-600 mt-0.5">{timeAgo(n.created_at)}</p>
              </div>

              {!n.is_read && (
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {preview.length > 0 && (
        <button
          onClick={() => { onClose(); router.push('/notifications') }}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-3 border-t border-zinc-800 text-xs font-medium text-violet-400 hover:text-violet-300 hover:bg-zinc-800/40 transition-all"
        >
          {hasMore ? `Altre notifiche →` : 'Vedi tutte →'}
        </button>
      )}
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { theme, toggleTheme } = useTheme()
  const { t } = useLocale()

  const [hasNewNotifications, setHasNewNotifications] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
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
    { href: '/feed',     label: t.nav.home,    icon: Home      },
    { href: '/discover', label: t.nav.discover, icon: Search   },
    { href: '/for-you',  label: t.nav.forYou,  icon: Sparkles  },
    { href: '/news',     label: t.nav.news,    icon: Newspaper },
  ]

  const MOBILE_NAV_ITEMS = [
    { href: '/feed',       label: t.nav.home,     icon: Home,     hasDot: false },
    { href: '/discover',   label: t.nav.discover, icon: Search,   hasDot: false },
    { href: '/for-you',    label: t.nav.forYou,   icon: Sparkles, hasDot: false },
    { href: '/trending',   label: 'Trending',     icon: TrendingUp, hasDot: false },
    { href: '/profile/me', label: t.nav.profile,  icon: User,     hasDot: false },
  ]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setSearchQuery(''); setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (isAuthPage) return
    const channelRef = { current: null as ReturnType<typeof supabase.channel> | null }
    let cancelled = false

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      setIsLoggedIn(!!user)
      if (!user) return
      setUserId(user.id)

      supabase.from('profiles').select('avatar_url, display_name, username').eq('id', user.id).single()
        .then(({ data }) => {
          if (cancelled || !data) return
          setAvatarUrl(data.avatar_url || null)
          setDisplayName(data.display_name || null)
          setUsername(data.username || null)
        })

      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id).eq('is_read', false)
        .then(({ count }) => { if (!cancelled && count && count > 0) setHasNewNotifications(true) })

      supabase.removeAllChannels()

      channelRef.current = supabase.channel('navbar-notifications')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `receiver_id=eq.${user.id}`,
        }, () => {
          setHasNewNotifications(true)
          if ('setAppBadge' in navigator) (navigator as any).setAppBadge(1).catch(() => {})
        })
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
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
  if (isPublicLanding && isLoggedIn === null) return null
  // Durante il caricamento iniziale su pagine autenticate, mostra solo
  // il placeholder della bottom nav mobile per evitare il flash
  if (isLoggedIn === null) return (
    <>
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-[100] h-16 bg-black/80 backdrop-blur-2xl border-b border-zinc-800/60" />
      {/* Mobile bottom nav sempre presente per evitare layout shift — icone invisibili */}
      <nav
        className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-black"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-[52px] px-2 opacity-0">
          {MOBILE_NAV_ITEMS.map((item) => (
            <div key={item.href} className="flex items-center justify-center flex-1 h-full">
              <item.icon size={24} strokeWidth={1.6} className="text-zinc-500" />
            </div>
          ))}
        </div>
      </nav>
    </>
  )

  const isDark = theme === 'dark' || theme === 'oled'
  const currentUsername = username || ''
  const currentDisplayName = displayName || username || ''
  const localAvatarSrc = currentUsername ? getLocalAvatarSvg(currentUsername, displayName) : undefined

  return (
    <>
      {/* ── Desktop navbar ───────────────────────────────────────────────────── */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-[100] bg-black/80 backdrop-blur-2xl border-b border-zinc-800/60">
        <div className="max-w-screen-2xl mx-auto w-full px-6 py-4 flex items-center justify-between gap-6">

          {/* Sinistra: Logo + Nav links */}
          <div className="flex items-center gap-6 flex-shrink-0">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/30 group-hover:scale-105 transition-transform">
                <Zap size={16} className="text-white" />
              </div>
              <span className="text-xl font-bold tracking-tighter text-white">geekore</span>
            </Link>

            <div className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === '/feed'
                  ? pathname === '/feed' || pathname === '/'
                  : pathname === item.href
                return (
                  <Link key={item.href} href={item.href} prefetch={true}
                    data-testid={`nav-${item.href.replace('/', '')}`}
                    onMouseEnter={item.href === '/for-you' && !isActive
                      ? () => fetch('/api/recommendations?type=all', { credentials: 'include' }).catch(() => {})
                      : undefined}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isActive ? 'bg-violet-500/10 text-violet-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}>
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Centro: Search bar */}
          <div ref={searchRef} className="flex-1 max-w-sm relative">
            <div className={`flex items-center gap-2 bg-zinc-900 border rounded-2xl px-4 py-2 transition-all ${searchOpen && searchResults.length > 0 ? 'border-violet-500/50' : 'border-zinc-800 focus-within:border-violet-500/30'}`}>
              <Search size={14} className={searchLoading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'} />
              <input
                ref={searchInputRef} value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca utenti..."
                className="bg-transparent outline-none text-sm w-full placeholder-zinc-600 text-white"
              />
              {searchQuery && (
                <button onClick={clearSearch} className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0">
                  <X size={13} />
                </button>
              )}
            </div>

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

          {/* Destra: campanella + theme + avatar */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Campanella */}
            <div className="relative">
              <button
                onClick={() => { setNotifOpen(v => !v); setDropdownOpen(false) }}
                className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all ${notifOpen ? 'bg-violet-500/10 text-violet-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                aria-label="Notifiche"
              >
                <Bell size={18} />
                {hasNewNotifications && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-black" />
                )}
              </button>

              {userId && (
                <NotificationPopover
                  open={notifOpen}
                  onClose={() => setNotifOpen(false)}
                  userId={userId}
                  onRead={() => {
                    setHasNewNotifications(false)
                    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
                      (navigator as any).clearAppBadge().catch(() => {})
                    }
                  }}
                />
              )}
            </div>

            {/* Theme toggle */}
            <button onClick={toggleTheme} title={isDark ? 'Tema chiaro' : 'Tema scuro'}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-yellow-400 hover:bg-zinc-900 transition-all">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Avatar dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => { setDropdownOpen(v => !v); setNotifOpen(false) }}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all ${dropdownOpen ? 'bg-zinc-800 border-violet-500/50' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'}`}
              >
                <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-violet-500/30 flex-shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" width={28} height={28} className="w-full h-full object-cover" />
                  ) : currentUsername ? (
                    <img src={localAvatarSrc} alt="avatar" width={28} height={28} className="w-full h-full object-cover" />
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
                <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-[110]">
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
                    <button data-testid="nav-logout" onClick={() => { setDropdownOpen(false); handleLogout() }}
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

      {/* ── Mobile bottom navbar — Instagram exact style ─────────────────── */}
      <nav
        className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-[100]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'rgba(0,0,0,0.96)',
          borderTop: '0.5px solid #262626',
        }}
      >
        <div className="flex items-center h-[49px]">
          {MOBILE_NAV_ITEMS.map((item) => {
            const isActive = item.href === '/profile/me'
              ? isProfileActive
              : item.href === '/feed'
              ? pathname === '/feed' || pathname === '/'
              : pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                data-testid={`nav-mobile-${item.href.replace('/', '')}`}
                className="flex items-center justify-center flex-1 h-full relative"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    navigator.vibrate(8)
                  }
                }}
              >
                {item.href === '/notifications' ? (
                  <div className="relative">
                    <Bell
                      size={26}
                      strokeWidth={isActive ? 2 : 1.6}
                      className={isActive ? 'text-white' : 'text-zinc-500'}
                      fill={isActive ? 'white' : 'none'}
                    />
                    {hasNewNotifications && (
                      <span className="absolute -top-0.5 -right-0.5 w-[8px] h-[8px] bg-red-500 rounded-full border-[1.5px] border-black" />
                    )}
                  </div>
                ) : item.href === '/profile/me' && (avatarUrl || currentUsername) ? (
                  /* Avatar with ring — Instagram's most recognizable detail */
                  <div
                    className="rounded-full p-[2px]"
                    style={{
                      background: isActive
                        ? 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'
                        : 'transparent',
                      border: isActive ? 'none' : '1.5px solid #555',
                    }}
                  >
                    <div className="rounded-full overflow-hidden bg-black p-[1.5px]">
                      <div className="w-[24px] h-[24px] rounded-full overflow-hidden">
                        <img
                          src={avatarUrl || localAvatarSrc}
                          alt="avatar"
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <item.icon
                    size={26}
                    strokeWidth={isActive ? 2 : 1.6}
                    className={isActive ? 'text-white' : 'text-zinc-500'}
                    fill={isActive && (item.href === '/feed' || item.href === '/for-you') ? 'white' : 'none'}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}