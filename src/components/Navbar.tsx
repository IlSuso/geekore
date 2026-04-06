'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Rss, Bell, User, Zap } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/',              label: 'Home',      icon: Home   },
  { href: '/discover',      label: 'Discover',  icon: Search },
  { href: '/feed',          label: 'Feed',      icon: Rss    },
  { href: '/notifications', label: 'Notifiche', icon: Bell, hasDot: true },
  { href: '/profile/me',    label: 'Profilo',   icon: User   },
]

const AUTH_PATHS = ['/login', '/register', '/auth/confirm']

export default function Navbar() {
  const pathname = usePathname()
  const supabase = createClient()
  const [hasNewNotifications, setHasNewNotifications] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const isProfileActive = pathname === '/profile/me' || pathname.startsWith('/profile/')

  if (AUTH_PATHS.some(p => pathname.startsWith(p))) return null

  useEffect(() => {
    if (pathname === '/notifications') setHasNewNotifications(false)
  }, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

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
  }, [])

  return (
    <>
      {/* Desktop navbar */}
      <nav className={`hidden md:flex fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#080810]/95 backdrop-blur-2xl border-b border-white/5 shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto w-full px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30 group-hover:shadow-violet-500/50 group-hover:scale-105 transition-all">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
                <path d="M13 2L4.09 12.97 12 12l-1 9 8.91-10.97L12 11z"/>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tighter text-white">geekore</span>
          </Link>

          {/* Nav items */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-2 py-1.5 backdrop-blur-sm">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === '/profile/me' ? isProfileActive : pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-violet-500/15 text-violet-300 shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span>{item.label}</span>
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
                  )}
                </Link>
              )
            })}
          </div>

          <div className="w-[120px]" />
        </div>
      </nav>

      {/* Mobile bottom navbar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#080810]/95 backdrop-blur-2xl border-t border-white/5"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Top glow line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

        <div className="flex items-center justify-around py-2 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/profile/me' ? isProfileActive : pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 min-w-[56px] py-2 px-3 rounded-2xl transition-all active:scale-90 ${
                  isActive ? 'text-violet-400' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <div className="relative">
                  {isActive && (
                    <div className="absolute inset-0 bg-violet-500/20 rounded-xl blur-md scale-150" />
                  )}
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} className="relative" />
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-[1.5px] border-[#080810]" />
                  )}
                </div>
                <span className={`text-[9px] font-semibold tracking-wider uppercase transition-all ${
                  isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
                }`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="h-16 hidden md:block" />
    </>
  )
}
